import type { AuditResult, AuditSummary } from '@/lib/audit/types';

export type PlanId = 'single' | 'pack' | 'agency';

export interface LicenseRecord {
  /** The Lemon Squeezy license key, stored hashed — never in plaintext. */
  keyHash: string;
  /** Last 4 characters, shown in the dashboard so a customer can identify a key. */
  keyTail: string;
  plan: PlanId;
  email: string;
  /** Total audits this license grants. Null means unmetered (agency subscription). */
  auditQuota: number | null;
  auditsUsed: number;
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
   * Atomically consume one audit credit.
   * Returns false when the quota is exhausted, without incrementing.
   */
  consumeCredit(keyHash: string): Promise<boolean>;

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
