import { store } from '@/lib/db';
import type { LicenseRecord, PlanId } from '@/lib/db/types';
import { PLANS, planById } from '@/lib/plans';
import {
  hashLicenseKey,
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

export function quotaForPlan(plan: PlanId): number | null {
  return planById(plan)?.auditQuota ?? null;
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
    auditQuota: quotaForPlan(params.plan),
    auditsUsed: 0,
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

  return recordLicense({
    licenseKey,
    plan,
    email: validation.email ?? 'unknown@usecrawlable.com',
    orderId: validation.orderId ?? `unmapped-${Date.now()}`,
    status: validation.status === 'active' ? 'active' : 'expired',
  });
}

export interface CreditCheck {
  allowed: boolean;
  reason: string | null;
  remaining: number | null;
}

/** Spend one audit credit, or explain why it could not be spent. */
export async function spendCredit(keyHash: string): Promise<CreditCheck> {
  const db = await store();
  const license = await db.getLicense(keyHash);

  if (!license) return { allowed: false, reason: 'License not found.', remaining: 0 };
  if (license.status !== 'active') {
    return { allowed: false, reason: `License is ${license.status}.`, remaining: 0 };
  }

  const consumed = await db.consumeCredit(keyHash);
  if (!consumed) {
    return {
      allowed: false,
      reason:
        license.auditQuota === null
          ? 'License is not active.'
          : `All ${license.auditQuota} audit credits on this license are used.`,
      remaining: 0,
    };
  }

  const updated = await db.getLicense(keyHash);
  const remaining =
    updated?.auditQuota === null || updated === null
      ? null
      : Math.max(0, updated.auditQuota - updated.auditsUsed);

  return { allowed: true, reason: null, remaining };
}

export function remainingCredits(license: LicenseRecord): number | null {
  if (license.auditQuota === null) return null;
  return Math.max(0, license.auditQuota - license.auditsUsed);
}
