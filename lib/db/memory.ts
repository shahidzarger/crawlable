import type { AuditSummary } from '@/lib/audit/types';
import type {
  AuditRecord,
  DomainClaim,
  DomainSlot,
  LicenseRecord,
  Store,
} from './types';

/**
 * In-process store.
 *
 * Used for local development and tests so the app runs with zero external
 * dependencies. It is explicitly not for production: a serverless deployment
 * gets a fresh instance per cold start, so nothing here survives. The health
 * endpoint reports which store is active for exactly this reason.
 */
export class MemoryStore implements Store {
  private licenses = new Map<string, LicenseRecord>();
  private audits = new Map<string, AuditRecord>();
  private buckets = new Map<string, number[]>();
  private domains = new Map<string, DomainSlot[]>();

  async init(): Promise<void> {
    // Nothing to set up.
  }

  async upsertLicense(record: LicenseRecord): Promise<void> {
    const existing = this.licenses.get(record.keyHash);
    this.licenses.set(record.keyHash, {
      ...record,
      // Never reset usage or resend a reminder when a webhook is redelivered.
      auditsUsed: existing?.auditsUsed ?? record.auditsUsed,
      nudgedAt: existing?.nudgedAt ?? record.nudgedAt,
      createdAt: existing?.createdAt ?? record.createdAt,
    });
  }

  async getLicense(keyHash: string): Promise<LicenseRecord | null> {
    return this.licenses.get(keyHash) ?? null;
  }

  async getLicenseByOrder(orderId: string): Promise<LicenseRecord | null> {
    for (const record of this.licenses.values()) {
      if (record.orderId === orderId) return record;
    }
    return null;
  }

  async updateLicenseStatus(
    keyHash: string,
    status: LicenseRecord['status'],
  ): Promise<void> {
    const record = this.licenses.get(keyHash);
    if (!record) return;
    record.status = status;
    record.updatedAt = new Date().toISOString();
  }

  async updateLicenseBranding(
    keyHash: string,
    brandName: string | null,
    brandColor: string | null,
  ): Promise<void> {
    const record = this.licenses.get(keyHash);
    if (!record) return;
    record.brandName = brandName;
    record.brandColor = brandColor;
    record.updatedAt = new Date().toISOString();
  }

  async consumeCredit(keyHash: string): Promise<boolean> {
    const record = this.licenses.get(keyHash);
    if (!record || record.status !== 'active') return false;
    if (record.auditQuota === null) return true;
    if (record.auditsUsed >= record.auditQuota) return false;
    record.auditsUsed += 1;
    record.updatedAt = new Date().toISOString();
    return true;
  }

  async listDomains(keyHash: string): Promise<DomainSlot[]> {
    return [...(this.domains.get(keyHash) ?? [])].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  }

  async claimDomain(
    keyHash: string,
    domain: string,
    limit: number,
  ): Promise<DomainClaim> {
    /*
     * Single-threaded, so no lock is needed here — but the ordering mirrors
     * the Postgres implementation exactly so the two cannot diverge in
     * behaviour: an existing domain is always allowed, and the limit is only
     * consulted for a domain that is not yet registered.
     */
    const slots = this.domains.get(keyHash) ?? [];
    const now = new Date().toISOString();

    const existing = slots.find((slot) => slot.domain === domain);
    if (existing) {
      existing.lastScannedAt = now;
      return 'existing';
    }

    if (slots.length >= limit) return 'limit-reached';

    slots.push({ domain, createdAt: now, lastScannedAt: now });
    this.domains.set(keyHash, slots);
    return 'claimed';
  }

  async listLicensesToNudge(minAgeHours: number, limit: number): Promise<LicenseRecord[]> {
    const cutoff = Date.now() - minAgeHours * 3600_000;
    return [...this.licenses.values()]
      .filter(
        (record) =>
          record.status === 'active' &&
          record.auditsUsed === 0 &&
          record.nudgedAt === null &&
          Date.parse(record.createdAt) < cutoff,
      )
      .slice(0, limit);
  }

  async markNudged(keyHash: string): Promise<void> {
    const record = this.licenses.get(keyHash);
    if (!record) return;
    record.nudgedAt = new Date().toISOString();
    record.updatedAt = record.nudgedAt;
  }

  async saveAudit(record: AuditRecord): Promise<void> {
    this.audits.set(record.id, record);
  }

  async getAudit(id: string): Promise<AuditRecord | null> {
    return this.audits.get(id) ?? null;
  }

  async listAudits(licenseKeyHash: string, limit = 50): Promise<AuditSummary[]> {
    return [...this.audits.values()]
      .filter((audit) => audit.licenseKeyHash === licenseKeyHash)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((audit) => ({
        id: audit.id,
        siteUrl: audit.siteUrl,
        mode: audit.mode,
        createdAt: audit.createdAt,
        score: audit.result.score,
        grade: audit.result.grade,
        invisiblePercent: audit.invisiblePercent,
        pagesAudited: audit.result.pagesAudited,
      }));
  }

  async rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const hits = (this.buckets.get(bucket) ?? []).filter((t) => t > windowStart);

    if (hits.length >= limit) {
      this.buckets.set(bucket, hits);
      return false;
    }

    hits.push(now);
    this.buckets.set(bucket, hits);

    // Opportunistic cleanup so a long-lived process does not grow unbounded.
    if (this.buckets.size > 10_000) {
      for (const [key, times] of this.buckets) {
        if (times.every((t) => t <= windowStart)) this.buckets.delete(key);
      }
    }

    return true;
  }

  async healthy(): Promise<boolean> {
    return true;
  }
}
