import { lemonSqueezyConfig } from '@/lib/env';
import { PLANS, planById } from '@/lib/plans';
import type { PlanId } from '@/lib/db/types';

/**
 * Configuration diagnostics for the Lemon Squeezy wiring.
 *
 * The failure this exists to catch is expensive and silent: a variant ID in
 * the environment that no longer points at the product it is named after.
 * The webhook cannot then resolve the plan, so a customer pays and receives
 * nothing until somebody provisions them by hand — and nobody finds out until
 * the refund request arrives. Changing a plan from a subscription to a
 * one-time purchase creates a NEW variant in Lemon Squeezy, which is exactly
 * when the IDs drift.
 *
 * Everything here is read-only. It never creates, updates or deletes anything
 * in the store.
 */

const API_BASE = 'https://api.lemonsqueezy.com/v1';

/** Live values read back from Lemon Squeezy for one variant. */
export interface LiveVariant {
  variantId: string;
  variantName: string;
  productName: string | null;
  /** Unit price in major units, e.g. 29 for $29.00. */
  priceUsd: number | null;
  priceFormatted: string | null;
  currency: string | null;
  /** 'one_time' | 'subscription' | 'lead_magnet' | 'pwyw', as the API reports it. */
  billingCategory: string | null;
  /** Human form of the renewal period, when the price is a subscription. */
  renewal: string | null;
  licenseKeysEnabled: boolean;
  status: string;
}

export interface VariantCheck {
  plan: PlanId;
  planName: string;
  envVar: string;
  variantId: string | null;
  ok: boolean;
  /** Every discrepancy, in words a person can act on. */
  problems: string[];
  expected: { priceUsd: number; billingCategory: string; licenseKeysEnabled: true };
  live: LiveVariant | null;
}

export interface ConfigCheckResult {
  status: 'ok' | 'mismatch' | 'error';
  checkedAt: string;
  storeId: string | null;
  storeName: string | null;
  currency: string | null;
  variants: VariantCheck[];
  /** Populated only when the check could not run at all. */
  error?: string;
  notes: string[];
}

const ENV_VAR_FOR: Record<PlanId, string> = {
  single: 'LEMONSQUEEZY_VARIANT_SINGLE',
  pack: 'LEMONSQUEEZY_VARIANT_PACK',
  agency: 'LEMONSQUEEZY_VARIANT_AGENCY',
};

interface ApiResource {
  data?: { attributes?: Record<string, unknown>; id?: string } | Array<{
    attributes?: Record<string, unknown>;
    id?: string;
  }>;
  errors?: Array<{ detail?: string; title?: string }>;
}

async function api(path: string, apiKey: string): Promise<ApiResource | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as ApiResource;
  } catch {
    return null;
  }
}

function first(resource: ApiResource | null): Record<string, unknown> | null {
  if (!resource?.data) return null;
  const node = Array.isArray(resource.data) ? resource.data[0] : resource.data;
  return (node?.attributes as Record<string, unknown> | undefined) ?? null;
}

function money(cents: number | null, currency: string | null): string | null {
  if (cents === null) return null;
  const amount = (cents / 100).toFixed(2);
  return currency ? `${amount} ${currency}` : amount;
}

async function readVariant(
  variantId: string,
  apiKey: string,
  currency: string | null,
): Promise<LiveVariant | null> {
  const variant = first(await api(`/variants/${variantId}`, apiKey));
  if (!variant) return null;

  const product = first(await api(`/variants/${variantId}/product`, apiKey));

  /*
   * Price comes from the Price object, not the variant.
   *
   * The variant's own `price` and `is_subscription` fields are deprecated and
   * kept only for backwards compatibility, so reading them would report a
   * figure the store may no longer charge. Prices are returned newest first
   * and carry no "active" flag, so the most recent record is the best
   * available answer — which is why the response says so in `notes` rather
   * than presenting it as certain.
   */
  const price = first(await api(`/prices?filter[variant_id]=${variantId}`, apiKey));
  const unitPrice = typeof price?.unit_price === 'number' ? price.unit_price : null;

  const renewalUnit = price?.renewal_interval_unit;
  const renewalQty = price?.renewal_interval_quantity;
  const renewal =
    typeof renewalUnit === 'string'
      ? `every ${typeof renewalQty === 'number' && renewalQty > 1 ? `${renewalQty} ` : ''}${renewalUnit}`
      : null;

  return {
    variantId,
    variantName: typeof variant.name === 'string' ? variant.name : '(unnamed)',
    productName: typeof product?.name === 'string' ? product.name : null,
    priceUsd: unitPrice === null ? null : unitPrice / 100,
    priceFormatted: money(unitPrice, currency),
    currency,
    billingCategory: typeof price?.category === 'string' ? price.category : null,
    renewal,
    licenseKeysEnabled: variant.has_license_keys === true,
    status: typeof variant.status === 'string' ? variant.status : 'unknown',
  };
}

/** Compare one variant's live state against what the plan catalogue sells. */
function compare(plan: PlanId, live: LiveVariant | null, variantId: string | null): VariantCheck {
  const catalogue = planById(plan);
  const expected = {
    priceUsd: catalogue?.priceUsd ?? 0,
    // Every plan is a one-time purchase now. If one ever becomes recurring
    // again, this follows the catalogue rather than needing an edit here.
    billingCategory: catalogue?.recurring ? 'subscription' : 'one_time',
    licenseKeysEnabled: true as const,
  };

  const problems: string[] = [];

  if (!variantId) {
    problems.push(`${ENV_VAR_FOR[plan]} is not set.`);
  } else if (!live) {
    problems.push(
      `Variant ${variantId} could not be read from Lemon Squeezy. The ID may be wrong, ` +
        'may belong to another store, or the API key may lack access.',
    );
  } else {
    if (live.priceUsd === null) {
      problems.push('No price record was returned for this variant.');
    } else if (live.priceUsd !== expected.priceUsd) {
      problems.push(
        `Price is ${live.priceFormatted ?? live.priceUsd} but the site advertises $${expected.priceUsd}. ` +
          'A customer would be shown one number and charged another.',
      );
    }

    if (live.billingCategory !== expected.billingCategory) {
      problems.push(
        `Billing is "${live.billingCategory ?? 'unknown'}" but should be "${expected.billingCategory}"` +
          (live.renewal ? ` (currently renews ${live.renewal})` : '') +
          '.',
      );
    }

    if (!live.licenseKeysEnabled) {
      problems.push(
        'License key generation is OFF. No key means license_key_created never fires, ' +
          'so a buyer pays and receives nothing.',
      );
    }

    if (live.status !== 'published') {
      problems.push(`Variant status is "${live.status}", not "published".`);
    }
  }

  return {
    plan,
    planName: catalogue?.name ?? plan,
    envVar: ENV_VAR_FOR[plan],
    variantId,
    ok: problems.length === 0,
    problems,
    expected,
    live,
  };
}

/**
 * Read every configured variant back from Lemon Squeezy and compare it with
 * the plan catalogue.
 */
export async function checkLemonSqueezyConfig(): Promise<ConfigCheckResult> {
  const checkedAt = new Date().toISOString();

  let config: ReturnType<typeof lemonSqueezyConfig>;
  try {
    config = lemonSqueezyConfig();
  } catch (error) {
    return {
      status: 'error',
      checkedAt,
      storeId: null,
      storeName: null,
      currency: null,
      variants: [],
      error: error instanceof Error ? error.message : 'Lemon Squeezy is not configured.',
      notes: [],
    };
  }

  // The store also settles the currency, and reading it proves
  // LEMONSQUEEZY_STORE_ID points at a store this key can see.
  const storeAttributes = first(await api(`/stores/${config.storeId}`, config.apiKey));
  const currency =
    typeof storeAttributes?.currency === 'string' ? storeAttributes.currency : null;

  const variantIds: Record<PlanId, string> = {
    single: config.variants.single,
    pack: config.variants.pack,
    agency: config.variants.agency,
  };

  const checks = await Promise.all(
    PLANS.map(async (plan) => {
      const variantId = variantIds[plan.id];
      const live = variantId ? await readVariant(variantId, config.apiKey, currency) : null;
      return compare(plan.id, live, variantId ?? null);
    }),
  );

  const notes: string[] = [
    'Price is read from the Price object; the variant\'s own price field is deprecated.',
    'Lemon Squeezy returns prices newest first with no active flag, so the most recent price record is used.',
  ];

  if (!storeAttributes) {
    notes.push(
      `Store ${config.storeId} could not be read, so currency is unknown and LEMONSQUEEZY_STORE_ID may be wrong.`,
    );
  }

  return {
    status: checks.every((check) => check.ok) ? 'ok' : 'mismatch',
    checkedAt,
    storeId: config.storeId,
    storeName: typeof storeAttributes?.name === 'string' ? storeAttributes.name : null,
    currency,
    variants: checks,
    notes,
  };
}
