import postgres from 'postgres';
import type { AuditResult, AuditSummary } from '@/lib/audit/types';
import type {
  AuditRecord,
  DomainClaim,
  DomainSlot,
  LicenseRecord,
  PlanId,
  Store,
} from './types';

/**
 * Postgres-backed store. Works against Neon, Supabase, Vercel Postgres or any
 * standard Postgres 13+ instance.
 *
 * Connection settings are tuned for serverless: a tiny pool, no prepared
 * statements (incompatible with transaction-mode poolers such as PgBouncer),
 * and short idle timeouts so lambdas release connections promptly.
 */

export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS licenses (
  key_hash        TEXT PRIMARY KEY,
  key_tail        TEXT NOT NULL,
  plan            TEXT NOT NULL,
  email           TEXT NOT NULL,
  target_domain   TEXT,
  total_scans_allowed INTEGER NOT NULL DEFAULT 1,
  scans_used      INTEGER NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  order_id        TEXT NOT NULL,
  subscription_id TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  brand_name      TEXT,
  brand_color     TEXT,
  nudged_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Added after the initial release; safe to run against an existing table.
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS nudged_at TIMESTAMPTZ;

/*
 * Audit credits became scan credits.
 *
 * The rename runs only when the old column is present and the new one is not,
 * which makes it safe to run on a fresh database (CREATE TABLE already used
 * the new names, so neither branch fires) and safe to run twice on an existing
 * one. A plain ALTER ... RENAME has no IF EXISTS form, so the guard is the
 * whole point: init() runs on every cold start, and an unguarded rename would
 * throw on the second.
 */
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'licenses' AND column_name = 'audit_quota'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'licenses' AND column_name = 'total_scans_allowed'
  ) THEN
    ALTER TABLE licenses RENAME COLUMN audit_quota TO total_scans_allowed;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'licenses' AND column_name = 'audits_used'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'licenses' AND column_name = 'scans_used'
  ) THEN
    ALTER TABLE licenses RENAME COLUMN audits_used TO scans_used;
  END IF;
END $$;

ALTER TABLE licenses ADD COLUMN IF NOT EXISTS target_domain TEXT;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS total_scans_allowed INTEGER;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS scans_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

/*
 * Backfill the one row shape the rename cannot express: the old Agency
 * subscription stored NULL to mean "unmetered". Nothing is unmetered now, so
 * a NULL here would make every comparison against it false and silently lock
 * the customer out. 50 is what the plan they hold now sells.
 */
UPDATE licenses SET total_scans_allowed = 50
  WHERE total_scans_allowed IS NULL AND plan = 'agency';
UPDATE licenses SET total_scans_allowed = 1 WHERE total_scans_allowed IS NULL;

CREATE INDEX IF NOT EXISTS licenses_order_id_idx ON licenses (order_id);
CREATE INDEX IF NOT EXISTS licenses_email_idx ON licenses (email);

CREATE TABLE IF NOT EXISTS audits (
  id                TEXT PRIMARY KEY,
  license_key_hash  TEXT REFERENCES licenses (key_hash) ON DELETE SET NULL,
  site_url          TEXT NOT NULL,
  mode              TEXT NOT NULL,
  score             INTEGER NOT NULL,
  invisible_percent INTEGER NOT NULL,
  result            JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audits_license_idx ON audits (license_key_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS audits_created_idx ON audits (created_at DESC);

/*
 * Website slots for subscription plans.
 *
 * Keyed on the license HASH, never the key itself. This column was specified
 * as a plaintext license_key, but the whole licensing design rests on the key
 * never being stored: a breach of this database must not yield working
 * credentials. A second table holding them in the clear would undo that for
 * every subscriber.
 */
CREATE TABLE IF NOT EXISTS subscription_domains (
  id               BIGSERIAL PRIMARY KEY,
  license_key_hash TEXT NOT NULL REFERENCES licenses (key_hash) ON DELETE CASCADE,
  domain           TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_scanned_at  TIMESTAMPTZ
);

-- Unique so re-auditing a registered site can never consume a second slot.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_domains_key_domain_idx
  ON subscription_domains (license_key_hash, domain);

/*
 * Order -> plan, written by order_created and read by license_key_created.
 *
 * Deliberately not a foreign key to licenses: the whole point is that this row
 * exists BEFORE the licence does.
 */
CREATE TABLE IF NOT EXISTS order_plans (
  order_id   TEXT PRIMARY KEY,
  plan       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket     TEXT NOT NULL,
  hit_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rate_limits_bucket_idx ON rate_limits (bucket, hit_at DESC);
`;

interface LicenseRow {
  key_hash: string;
  key_tail: string;
  plan: string;
  email: string;
  target_domain: string | null;
  total_scans_allowed: number;
  scans_used: number;
  expires_at: Date | null;
  order_id: string;
  subscription_id: string | null;
  status: string;
  brand_name: string | null;
  brand_color: string | null;
  nudged_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toLicense(row: LicenseRow): LicenseRecord {
  return {
    keyHash: row.key_hash,
    keyTail: row.key_tail,
    plan: row.plan as PlanId,
    email: row.email,
    targetDomain: row.target_domain,
    totalScansAllowed: row.total_scans_allowed,
    scansUsed: row.scans_used,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    orderId: row.order_id,
    subscriptionId: row.subscription_id,
    status: row.status as LicenseRecord['status'],
    brandName: row.brand_name,
    brandColor: row.brand_color,
    nudgedAt: row.nudged_at ? row.nudged_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresStore implements Store {
  private sql: postgres.Sql;

  constructor(connectionString: string) {
    this.sql = postgres(connectionString, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      onnotice: () => undefined,
    });
  }

  async init(): Promise<void> {
    await this.sql.unsafe(MIGRATION_SQL);
  }

  async upsertLicense(record: LicenseRecord): Promise<void> {
    await this.sql`
      INSERT INTO licenses (
        key_hash, key_tail, plan, email, target_domain,
        total_scans_allowed, scans_used, expires_at,
        order_id, subscription_id, status, brand_name, brand_color
      ) VALUES (
        ${record.keyHash}, ${record.keyTail}, ${record.plan}, ${record.email},
        ${record.targetDomain},
        ${record.totalScansAllowed}, ${record.scansUsed}, ${record.expiresAt},
        ${record.orderId},
        ${record.subscriptionId}, ${record.status}, ${record.brandName}, ${record.brandColor}
      )
      ON CONFLICT (key_hash) DO UPDATE SET
        plan                = EXCLUDED.plan,
        email               = EXCLUDED.email,
        total_scans_allowed = EXCLUDED.total_scans_allowed,
        subscription_id     = EXCLUDED.subscription_id,
        status              = EXCLUDED.status,
        updated_at          = NOW()
        /*
         * scans_used, target_domain and expires_at are deliberately NOT
         * updated on conflict. Lemon Squeezy retries a webhook on any non-2xx,
         * and a redelivered order_created must not reset the counter, unbind
         * the domain, or extend the window — which is exactly what would
         * happen if these were refreshed from EXCLUDED.
         */
    `;
  }

  async getLicense(keyHash: string): Promise<LicenseRecord | null> {
    const rows = await this.sql<LicenseRow[]>`
      SELECT * FROM licenses WHERE key_hash = ${keyHash} LIMIT 1
    `;
    const row = rows[0];
    return row ? toLicense(row) : null;
  }

  async getLicenseByOrder(orderId: string): Promise<LicenseRecord | null> {
    const rows = await this.sql<LicenseRow[]>`
      SELECT * FROM licenses WHERE order_id = ${orderId} LIMIT 1
    `;
    const row = rows[0];
    return row ? toLicense(row) : null;
  }

  async updateLicenseStatus(
    keyHash: string,
    status: LicenseRecord['status'],
  ): Promise<void> {
    await this.sql`
      UPDATE licenses SET status = ${status}, updated_at = NOW()
      WHERE key_hash = ${keyHash}
    `;
  }

  async updateLicenseBranding(
    keyHash: string,
    brandName: string | null,
    brandColor: string | null,
  ): Promise<void> {
    await this.sql`
      UPDATE licenses
      SET brand_name = ${brandName}, brand_color = ${brandColor}, updated_at = NOW()
      WHERE key_hash = ${keyHash}
    `;
  }

  async consumeScan(keyHash: string): Promise<boolean> {
    // A single conditional UPDATE, so two concurrent audits cannot both spend
    // the last scan. The expiry is evaluated in the same statement for the
    // same reason: a separate read-then-write could straddle the deadline.
    const rows = await this.sql<{ scans_used: number }[]>`
      UPDATE licenses
      SET scans_used = scans_used + 1, updated_at = NOW()
      WHERE key_hash = ${keyHash}
        AND status = 'active'
        AND scans_used < total_scans_allowed
        AND (expires_at IS NULL OR expires_at > NOW())
      RETURNING scans_used
    `;
    return rows.length > 0;
  }

  async bindTargetDomain(keyHash: string, domain: string): Promise<string> {
    /*
     * Bind only when unbound, and report back whatever the licence now holds.
     *
     * The COALESCE in the RETURNING clause is what makes one round trip
     * enough: the UPDATE matches the row either way, so the caller always
     * learns the authoritative domain — the one just written, or the one that
     * was already there and must not be overwritten.
     */
    const rows = await this.sql<{ target_domain: string }[]>`
      UPDATE licenses
      SET target_domain = COALESCE(target_domain, ${domain}), updated_at = NOW()
      WHERE key_hash = ${keyHash}
      RETURNING target_domain
    `;
    return rows[0]?.target_domain ?? domain;
  }

  async recordOrderPlan(orderId: string, plan: PlanId): Promise<void> {
    // First write wins. A redelivered order_created must not change the plan
    // under a licence that has already been provisioned from it.
    await this.sql`
      INSERT INTO order_plans (order_id, plan) VALUES (${orderId}, ${plan})
      ON CONFLICT (order_id) DO NOTHING
    `;
  }

  async getOrderPlan(orderId: string): Promise<PlanId | null> {
    const rows = await this.sql<{ plan: string }[]>`
      SELECT plan FROM order_plans WHERE order_id = ${orderId} LIMIT 1
    `;
    return (rows[0]?.plan as PlanId | undefined) ?? null;
  }

  async listDomains(keyHash: string): Promise<DomainSlot[]> {
    const rows = await this.sql<
      { domain: string; created_at: Date; last_scanned_at: Date | null }[]
    >`
      SELECT domain, created_at, last_scanned_at
      FROM subscription_domains
      WHERE license_key_hash = ${keyHash}
      ORDER BY created_at ASC
    `;

    return rows.map((row) => ({
      domain: row.domain,
      createdAt: row.created_at.toISOString(),
      lastScannedAt: row.last_scanned_at?.toISOString() ?? null,
    }));
  }

  async claimDomain(
    keyHash: string,
    domain: string,
    limit: number,
  ): Promise<DomainClaim> {
    /*
     * Serialised per license by locking its row first.
     *
     * Without the lock, two concurrent audits of two different new domains
     * against the last free slot would both read count = limit - 1 under READ
     * COMMITTED and both insert, handing out more slots than the plan sells.
     * A conditional INSERT ... WHERE (SELECT count(*)) < limit has the same
     * race: the subquery is evaluated per statement, not under a lock.
     */
    return this.sql.begin(async (tx) => {
      await tx`SELECT 1 FROM licenses WHERE key_hash = ${keyHash} FOR UPDATE`;

      const existing = await tx<{ domain: string }[]>`
        UPDATE subscription_domains
        SET last_scanned_at = NOW()
        WHERE license_key_hash = ${keyHash} AND domain = ${domain}
        RETURNING domain
      `;
      if (existing.length > 0) return 'existing' as const;

      const [counted] = await tx<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM subscription_domains
        WHERE license_key_hash = ${keyHash}
      `;
      if ((counted?.count ?? 0) >= limit) return 'limit-reached' as const;

      await tx`
        INSERT INTO subscription_domains (license_key_hash, domain, last_scanned_at)
        VALUES (${keyHash}, ${domain}, NOW())
        ON CONFLICT (license_key_hash, domain)
        DO UPDATE SET last_scanned_at = NOW()
      `;
      return 'claimed' as const;
    });
  }

  async listLicensesToNudge(minAgeHours: number, limit: number): Promise<LicenseRecord[]> {
    const rows = await this.sql<LicenseRow[]>`
      SELECT * FROM licenses
      WHERE status = 'active'
        AND scans_used = 0
        AND nudged_at IS NULL
        AND created_at < NOW() - (${minAgeHours}::text || ' hours')::interval
      ORDER BY created_at ASC
      LIMIT ${limit}
    `;
    return rows.map(toLicense);
  }

  async markNudged(keyHash: string): Promise<void> {
    await this.sql`
      UPDATE licenses SET nudged_at = NOW(), updated_at = NOW()
      WHERE key_hash = ${keyHash}
    `;
  }

  async saveAudit(record: AuditRecord): Promise<void> {
    await this.sql`
      INSERT INTO audits (
        id, license_key_hash, site_url, mode, score, invisible_percent, result
      ) VALUES (
        ${record.id}, ${record.licenseKeyHash}, ${record.siteUrl}, ${record.mode},
        ${record.score}, ${record.invisiblePercent},
        ${this.sql.json(record.result as unknown as postgres.JSONValue)}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  async getAudit(id: string): Promise<AuditRecord | null> {
    const rows = await this.sql<
      {
        id: string;
        license_key_hash: string | null;
        site_url: string;
        mode: string;
        score: number;
        invisible_percent: number;
        result: AuditResult;
        created_at: Date;
      }[]
    >`SELECT * FROM audits WHERE id = ${id} LIMIT 1`;

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      licenseKeyHash: row.license_key_hash,
      siteUrl: row.site_url,
      mode: row.mode as 'scan' | 'audit',
      score: row.score,
      invisiblePercent: row.invisible_percent,
      result: row.result,
      createdAt: row.created_at.toISOString(),
    };
  }

  async listAudits(licenseKeyHash: string, limit = 50): Promise<AuditSummary[]> {
    const rows = await this.sql<
      {
        id: string;
        site_url: string;
        mode: string;
        score: number;
        invisible_percent: number;
        created_at: Date;
        result: AuditResult;
      }[]
    >`
      SELECT id, site_url, mode, score, invisible_percent, created_at, result
      FROM audits
      WHERE license_key_hash = ${licenseKeyHash}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      id: row.id,
      siteUrl: row.site_url,
      mode: row.mode as 'scan' | 'audit',
      createdAt: row.created_at.toISOString(),
      score: row.score,
      grade: row.result.grade,
      invisiblePercent: row.invisible_percent,
      pagesAudited: row.result.pagesAudited,
    }));
  }

  async rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
    const rows = await this.sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count
      FROM rate_limits
      WHERE bucket = ${bucket}
        AND hit_at > NOW() - (${windowSeconds}::text || ' seconds')::interval
    `;

    const count = Number.parseInt(rows[0]?.count ?? '0', 10);
    if (count >= limit) return false;

    await this.sql`INSERT INTO rate_limits (bucket) VALUES (${bucket})`;

    // Sweep expired rows roughly one call in fifty.
    if (Math.random() < 0.02) {
      await this.sql`
        DELETE FROM rate_limits WHERE hit_at < NOW() - INTERVAL '1 day'
      `;
    }

    return true;
  }

  async healthy(): Promise<boolean> {
    try {
      await this.sql`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
