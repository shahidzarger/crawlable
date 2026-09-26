import { store } from '@/lib/db';
import type { LicenseRecord, PlanId } from '@/lib/db/types';
import { PLANS, planById } from '@/lib/plans';
import {
  hashLicenseKey,
  isLicenseExpired,
  isUsableLicenseStatus,
  licenseTail,
  planIdForVariant,
  type LicenseValidation,
} from '@/lib/lemonsqueezy';

/**
 * Entitlement mapping.
 *
 * Lemon Squeezy owns the key; this module owns what the key is allowed to do.
 * Quotas come from the plan catalogue rather than from the webhook payload, so
 * a malformed or replayed webhook can never grant more credits than a plan sells.
 */

export function quotaForPlan(plan: PlanId): number {
  return planById(plan)?.totalScansAllowed ?? 1;
}

export function domainSlotsForPlan(plan: PlanId): number {
  return planById(plan)?.domainSlots ?? 1;
}

/**
 * When a licence bought now stops being usable.
 *
 * Computed at grant time and stored, rather than derived from createdAt on
 * every read. If the window length in the catalogue were ever changed, a
 * derived expiry would silently move the deadline for everyone who had already
 * bought — shortening it for some of them, which is not a change anyone should
 * be able to make by editing a marketing constant.
 */
export function expiryForPlan(plan: PlanId, from: Date = new Date()): string | null {
  const days = planById(plan)?.windowDays;
  if (days === undefined || days <= 0) return null;
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}

export async function recordLicense(params: {
  licenseKey: string;
  plan: PlanId;
  email: string;
  orderId: string;
  subscriptionId?: string | null;
  status?: LicenseRecord['status'];
}): Promise<LicenseRecord> {
  const now = new Date().toISOString();

  const record: LicenseRecord = {
    keyHash: hashLicenseKey(params.licenseKey),
    keyTail: licenseTail(params.licenseKey),
    plan: params.plan,
    email: params.email,
    targetDomain: null,
    totalScansAllowed: quotaForPlan(params.plan),
    scansUsed: 0,
    expiresAt: expiryForPlan(params.plan),
    orderId: params.orderId,
    subscriptionId: params.subscriptionId ?? null,
    status: params.status ?? 'active',
    brandName: null,
    brandColor: null,
    nudgedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const db = await store();
  await db.upsertLicense(record);

  // Re-read so callers see the merged record rather than the one just built,
  // which matters when a webhook is redelivered after credits were spent.
  return (await db.getLicense(record.keyHash)) ?? record;
}

/**
 * Create a local record for a key that Lemon Squeezy says is valid but that we
 * have not seen a webhook for yet.
 */
export async function provisionLicenseFromValidation(
  licenseKey: string,
  validation: LicenseValidation,
): Promise<LicenseRecord | null> {
  if (!validation.valid || !validation.variantId) return null;

  let plan: PlanId | null = null;
  try {
    plan = planIdForVariant(validation.variantId);
  } catch {
    plan = null;
  }

  // Fall back to matching on product name when variant IDs are not configured
  // — a fresh store during setup, for example.
  if (!plan && validation.productName) {
    const name = validation.productName.toLowerCase();
    const matched = PLANS.find((candidate) => name.includes(candidate.name.toLowerCase()));
    plan = matched?.id ?? null;
  }

  if (!plan) return null;

  /*
   * Map Lemon Squeezy's status onto ours.
   *
   * This previously read `validation.status === 'active' ? 'active' : 'expired'`,
   * which is the bug that made a freshly purchased key unusable. A key is
   * `inactive` from the moment it is issued until an instance is activated
   * against it — which for this product never happens, because we authenticate
   * by key rather than activating instances. So every new key was written to
   * our database as `expired`, and stayed that way: the webhook handler dedupes
   * on an existing record and does not correct the status, so a retry could not
   * recover it either.
   *
   * A key is dead only when Lemon Squeezy says `expired` or `disabled`, or when
   * a non-null expiry has actually passed.
   */
  const dead =
    !isUsableLicenseStatus(validation.status) || isLicenseExpired(validation.expiresAt);

  return recordLicense({
    licenseKey,
    plan,
    email: validation.email ?? 'unknown@usecrawlable.com',
    orderId: validation.orderId ?? `unmapped-${Date.now()}`,
    status: dead ? 'expired' : 'active',
  });
}

export interface CreditCheck {
  allowed: boolean;
  reason: string | null;
  remaining: number | null;
}

/** True when a licence's scan window has closed. */
export function isWindowClosed(license: LicenseRecord): boolean {
  if (license.expiresAt === null) return false;
  const expiry = Date.parse(license.expiresAt);
  // An unparseable timestamp is treated as open, for the same reason an
  // unparseable Lemon Squeezy expiry is: locking a paying customer out over a
  // date we failed to read is the worse of the two failures.
  if (Number.isNaN(expiry)) return false;
  return expiry <= Date.now();
}

/** Scans left on a licence, ignoring the window. */
export function remainingScans(license: LicenseRecord): number {
  return Math.max(0, license.totalScansAllowed - license.scansUsed);
}

/**
 * Spend one scan, or explain why it could not be spent.
 *
 * The explanation matters as much as the refusal here: "you have used all 3
 * scans" and "your 30-day window closed on 4 March" lead to completely
 * different next steps for the customer, and a generic "not allowed" leads to
 * a support ticket.
 */
export async function spendScan(keyHash: string): Promise<CreditCheck> {
  const db = await store();
  const license = await db.getLicense(keyHash);

  if (!license) return { allowed: false, reason: 'License not found.', remaining: 0 };
  if (license.status !== 'active') {
    return { allowed: false, reason: `License is ${license.status}.`, remaining: 0 };
  }

  const consumed = await db.consumeScan(keyHash);
  if (!consumed) {
    if (isWindowClosed(license)) {
      const closed = new Date(license.expiresAt as string).toISOString().slice(0, 10);
      return {
        allowed: false,
        reason: `This license's scan window closed on ${closed}.`,
        remaining: remainingScans(license),
      };
    }
    return {
      allowed: false,
      reason: `All ${license.totalScansAllowed} scans on this license are used.`,
      remaining: 0,
    };
  }

  const updated = await db.getLicense(keyHash);
  return {
    allowed: true,
    reason: null,
    remaining: updated ? remainingScans(updated) : null,
  };
}

/**
 * Decide whether a licence may audit a domain, and bind it on first use.
 *
 * Two different limits are at work and they are easy to confuse:
 *   - totalScansAllowed caps HOW OFTEN you may scan.
 *   - domainSlots caps HOW MANY distinct sites you may register.
 * Re-auditing a site you have already registered always passes the second
 * check; that is what makes "verification re-scan" free of slot cost.
 */
export type DomainDecision =
  | { allowed: true; domain: string; claim: 'existing' | 'claimed' }
  | { allowed: false; reason: string; code: 'domain-locked' | 'slots-full' };

export async function authoriseDomain(
  license: LicenseRecord,
  domain: string,
): Promise<DomainDecision> {
  const db = await store();
  const slots = domainSlotsForPlan(license.plan);

  if (slots <= 1) {
    /*
     * Single-domain plans bind on first use and stay bound.
     *
     * The bind is conditional inside the store, so two concurrent first audits
     * cannot bind two different domains — the second one reads back the first
     * one's domain and is refused here.
     */
    const bound = await db.bindTargetDomain(license.keyHash, domain);
    if (bound !== domain) {
      return {
        allowed: false,
        code: 'domain-locked',
        reason: `This license is registered to ${bound}. Upgrade to track more than one domain.`,
      };
    }
    return { allowed: true, domain, claim: 'existing' };
  }

  const claim = await db.claimDomain(license.keyHash, domain, slots);
  if (claim === 'limit-reached') {
    return {
      allowed: false,
      code: 'slots-full',
      reason: `All ${slots} domain slots on this license are in use. Re-scan one of them, or upgrade for more.`,
    };
  }

  // Record the first domain as the target too, so the re-scan banner on a
  // multi-domain plan still has something to offer by default.
  await db.bindTargetDomain(license.keyHash, domain);
  return { allowed: true, domain, claim };
}
