import type { AuditResult, AuditSummary } from '@/lib/audit/types';

export type PlanId = 'single' | 'pack' | 'agency';

export interface LicenseRecord {
  /** The Lemon Squeezy license key, stored hashed — never in plaintext. */
  keyHash: string;
  /** Last 4 characters, shown in the dashboard so a customer can identify a key. */
  keyTail: string;
  plan: PlanId;
  email: string;
  /**
   * The first domain audited on this licence, normalised to a bare hostname.
   *
   * Null until the first audit runs. It is what the re-scan flow re-crawls, so
   * that pressing "Re-Scan to Verify Fixes" cannot be turned into a way to
   * audit a different site for free.
   */
  targetDomain: string | null;
  /**
   * Total scans the licence grants, INCLUDING the first audit.
   *
   * No longer nullable. Null used to mean "unmetered", which only the Agency
   * subscription was; now every plan sells a finite number of scans, and a
   * nullable quota would leave an unreachable branch in every metering path
   * that reads it.
   */
  totalScansAllowed: number;
  scansUsed: number;
  /**
   * When the remaining scans stop being usable. Null means no expiry.
   *
   * The window is what makes "verification re-scan" a real promise rather than
   * an open-ended credit balance: it is there to be used while the fixes are
   * fresh.
   */
  expiresAt: string | null;
  /** Lemon Squeezy order identifier, for support lookups. */
  orderId: string;
  /** Subscription identifier when the plan is recurring. */
  subscriptionId: string | null;
  status: 'active' | 'cancelled' | 'expired';
  /** Agency white-label settings. */
  brandName: string | null;
  brandColor: string | null;
  /** When the unused-license reminder was sent, so it is sent at most once. */
  nudgedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One of the website slots a licence includes. */
export interface DomainSlot {
  domain: string;
  createdAt: string;
  lastScannedAt: string | null;
}

/**
 * Outcome of asking for permission to audit a domain on a slot-based plan.
 *
 *   existing      already registered — re-audit freely, nothing consumed
 *   claimed       a free slot was taken by this domain
 *   limit-reached every slot is spoken for by a different domain
 */
export type DomainClaim = 'existing' | 'claimed' | 'limit-reached';

export interface AuditRecord {
  id: string;
  /** Null for anonymous free scans. */
  licenseKeyHash: string | null;
  siteUrl: string;
  mode: 'scan' | 'audit';
  score: number;
  invisiblePercent: number;
  result: AuditResult;
  createdAt: string;
}

export interface Store {
  init(): Promise<void>;

  upsertLicense(record: LicenseRecord): Promise<void>;
  getLicense(keyHash: string): Promise<LicenseRecord | null>;
  getLicenseByOrder(orderId: string): Promise<LicenseRecord | null>;
  updateLicenseStatus(
    keyHash: string,
    status: LicenseRecord['status'],
  ): Promise<void>;
  updateLicenseBranding(
    keyHash: string,
    brandName: string | null,
    brandColor: string | null,
  ): Promise<void>;
  /**
   * Atomically consume one scan.
   *
   * Returns false when the quota is exhausted or the window has closed,
   * without incrementing. Both conditions are evaluated inside the same
   * statement as the increment, so a licence on its last scan cannot be spent
   * twice by two concurrent requests.
   */
  consumeScan(keyHash: string): Promise<boolean>;

  /**
   * Record the domain a licence is bound to, but only if it has none yet.
   *
   * Returns the domain the licence is now bound to, which is the EXISTING one
   * when it was already set — the caller compares that against what was asked
   * for. Writing it conditionally in the store rather than read-then-write in
   * the route is what stops two concurrent first audits from binding a licence
   * to two different domains.
   */
  bindTargetDomain(keyHash: string, domain: string): Promise<string>;

  /**
   * Remember which plan an order bought, before the licence key exists.
   *
   * order_created carries the variant ID but no key; license_key_created
   * carries the key but no variant. Without this bridge the second event can
   * only fall back to checkout metadata, and a purchase made through a raw
   * Lemon Squeezy buy link — which carries none — is orphaned and has to be
   * provisioned by hand.
   */
  recordOrderPlan(orderId: string, plan: PlanId): Promise<void>;
  getOrderPlan(orderId: string): Promise<PlanId | null>;

  /** Every website slot registered to a license, oldest first. */
  listDomains(keyHash: string): Promise<DomainSlot[]>;

  /**
   * Atomically claim a website slot.
   *
   * Must be atomic per license for the same reason consumeCredit is: two
   * concurrent audits of two different new domains, run against the last free
   * slot, must not both succeed. An already-registered domain is always
   * allowed regardless of how full the plan is — the limit is on how many
   * sites you may register, never on how often you may re-audit them.
   *
   * Touches last_scanned_at on every successful claim.
   */
  claimDomain(keyHash: string, domain: string, limit: number): Promise<DomainClaim>;

  /**
   * Active licenses that have never been used, bought at least `minAgeHours`
   * ago, and not yet reminded. Drives the day-2 onboarding nudge.
   */
  listLicensesToNudge(minAgeHours: number, limit: number): Promise<LicenseRecord[]>;
  markNudged(keyHash: string): Promise<void>;

  saveAudit(record: AuditRecord): Promise<void>;
  getAudit(id: string): Promise<AuditRecord | null>;
  listAudits(licenseKeyHash: string, limit?: number): Promise<AuditSummary[]>;

  /** Sliding-window rate limit. Returns false when the caller is over budget. */
  rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean>;

  /** True when the backing store is reachable. Used by /api/health. */
  healthy(): Promise<boolean>;
}
