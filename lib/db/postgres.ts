import postgres from 'postgres';
import type { AuditResult, AuditSummary } from '@/lib/audit/types';
import type { AuditRecord, LicenseRecord, PlanId, Store } from './types';

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
  audit_quota     INTEGER,
  audits_used     INTEGER NOT NULL DEFAULT 0,
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
  audit_quota: number | null;
  audits_used: number;
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
    auditQuota: row.audit_quota,
    auditsUsed: row.audits_used,
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
        key_hash, key_tail, plan, email, audit_quota, audits_used,
        order_id, subscription_id, status, brand_name, brand_color
      ) VALUES (
        ${record.keyHash}, ${record.keyTail}, ${record.plan}, ${record.email},
        ${record.auditQuota}, ${record.auditsUsed}, ${record.orderId},
        ${record.subscriptionId}, ${record.status}, ${record.brandName}, ${record.brandColor}
      )
      ON CONFLICT (key_hash) DO UPDATE SET
        plan            = EXCLUDED.plan,
        email           = EXCLUDED.email,
        audit_quota     = EXCLUDED.audit_quota,
        subscription_id = EXCLUDED.subscription_id,
        status          = EXCLUDED.status,
        updated_at      = NOW()
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

  async consumeCredit(keyHash: string): Promise<boolean> {
    // A single conditional UPDATE, so two concurrent audits cannot both spend
    // the last credit.
    const rows = await this.sql<{ audits_used: number }[]>`
      UPDATE licenses
      SET audits_used = audits_used + 1, updated_at = NOW()
      WHERE key_hash = ${keyHash}
        AND status = 'active'
        AND (audit_quota IS NULL OR audits_used < audit_quota)
      RETURNING audits_used
    `;
    return rows.length > 0;
  }

  async listLicensesToNudge(minAgeHours: number, limit: number): Promise<LicenseRecord[]> {
    const rows = await this.sql<LicenseRow[]>`
      SELECT * FROM licenses
      WHERE status = 'active'
        AND audits_used = 0
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
