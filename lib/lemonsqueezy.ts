import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { lemonSqueezyConfig, siteUrl } from '@/lib/env';
import type { Plan } from '@/lib/plans';

/**
 * Lemon Squeezy integration.
 *
 * Lemon Squeezy is the merchant of record, so it handles global VAT and sales
 * tax and issues the license keys. That means this app never stores a card
 * detail and never generates a key itself — it verifies keys against the
 * Lemon Squeezy License API and records entitlements locally.
 */

const API_BASE = 'https://api.lemonsqueezy.com/v1';

/**
 * License keys are stored hashed. A leaked database then yields nothing a
 * customer's key could be recovered from.
 */
export function hashLicenseKey(key: string): string {
  return createHash('sha256').update(key.trim()).digest('hex');
}

export function licenseTail(key: string): string {
  const trimmed = key.trim();
  return trimmed.slice(-4).toUpperCase();
}

/**
 * Verify a Lemon Squeezy webhook signature.
 * The signature is an HMAC-SHA256 of the exact raw request body, hex-encoded.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();

  let received: Buffer;
  try {
    received = Buffer.from(signature.trim(), 'hex');
  } catch {
    return false;
  }

  if (received.length !== expected.length) return false;
  return timingSafeEqual(expected, received);
}

export interface CheckoutParams {
  plan: Plan;
  /** Prefills the checkout so the customer does not retype it. */
  email?: string;
  /** Carried through the webhook so an audit can be attributed on return. */
  metadata?: Record<string, string>;
}

export interface CheckoutResult {
  url: string;
  checkoutId: string;
}

async function lsFetch(
  path: string,
  init: RequestInit & { apiKey: string },
): Promise<unknown> {
  const { apiKey, ...rest } = init;
  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`,
      ...(rest.headers ?? {}),
    },
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail =
      (payload as { errors?: { detail?: string }[] } | null)?.errors?.[0]?.detail ??
      `HTTP ${response.status}`;
    throw new Error(`Lemon Squeezy request failed: ${detail}`);
  }

  return payload;
}

/** Create a hosted checkout and return the URL to redirect the buyer to. */
export async function createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
  const config = lemonSqueezyConfig();
  const variantId = config.variants[params.plan.id];

  const body = {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_data: {
          ...(params.email ? { email: params.email } : {}),
          custom: params.metadata ?? {},
        },
        product_options: {
          redirect_url: `${siteUrl()}/dashboard?purchase=success`,
          receipt_button_text: 'Open your dashboard',
          receipt_link_url: `${siteUrl()}/dashboard`,
          receipt_thank_you_note:
            'Your license key is in this receipt. Paste it into the Crawlable dashboard to run your audits.',
        },
        checkout_options: {
          embed: false,
          media: false,
          logo: true,
        },
      },
      relationships: {
        store: { data: { type: 'stores', id: String(config.storeId) } },
        variant: { data: { type: 'variants', id: String(variantId) } },
      },
    },
  };

  const payload = (await lsFetch('/checkouts', {
    method: 'POST',
    apiKey: config.apiKey,
    body: JSON.stringify(body),
  })) as { data?: { id?: string; attributes?: { url?: string } } } | null;

  const url = payload?.data?.attributes?.url;
  const checkoutId = payload?.data?.id;

  if (!url || !checkoutId) {
    throw new Error('Lemon Squeezy did not return a checkout URL.');
  }

  return { url, checkoutId };
}

export interface LicenseValidation {
  valid: boolean;
  status: string | null;
  /** ISO timestamp, or null for a key that never expires. */
  expiresAt: string | null;
  email: string | null;
  orderId: string | null;
  productName: string | null;
  variantId: string | null;
  error: string | null;
}

/**
 * Lemon Squeezy license statuses that mean the key is finished.
 *
 * Everything else — including `inactive`, which is what a key looks like from
 * the moment it is issued until an instance is activated against it — is a
 * usable key. Treating `inactive` as dead rejects every customer who runs
 * their first audit before activating anything, which is all of them.
 */
const DEAD_STATUSES = new Set(['expired', 'disabled']);

export function isUsableLicenseStatus(status: string | null | undefined): boolean {
  if (!status) return true; // No status reported; `valid` already gated this.
  return !DEAD_STATUSES.has(status.toLowerCase());
}

/**
 * Whether a key's expiry has passed.
 *
 * `expires_at` is null for one-time purchases, which never expire. Comparing a
 * null through `new Date(null)` yields the epoch, which is always in the past —
 * the classic way this check locks out lifetime customers. An unparseable value
 * is treated as non-expiring too: refusing a paying customer because a date
 * failed to parse is the worse of the two errors.
 */
export function isLicenseExpired(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (expiresAt === null || expiresAt === undefined || expiresAt === '') return false;

  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) {
    console.warn('[license] unparseable expires_at, treating as non-expiring:', expiresAt);
    return false;
  }

  return parsed.getTime() <= now.getTime();
}

/**
 * Validate a license key against Lemon Squeezy.
 * This endpoint takes form-encoded data, not JSON:API, and needs no API key.
 */
export async function validateLicenseKey(key: string): Promise<LicenseValidation> {
  const response = await fetch(`${API_BASE}/licenses/validate`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ license_key: key.trim() }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        valid?: boolean;
        error?: string | null;
        license_key?: { status?: string; expires_at?: string | null };
        meta?: {
          customer_email?: string;
          order_id?: number;
          product_name?: string;
          variant_id?: number;
        };
      }
    | null;

  if (!payload) {
    return {
      valid: false,
      status: null,
      expiresAt: null,
      email: null,
      orderId: null,
      productName: null,
      variantId: null,
      error: 'Could not reach the license service.',
    };
  }

  return {
    valid: payload.valid === true,
    status: payload.license_key?.status ?? null,
    expiresAt: payload.license_key?.expires_at ?? null,
    email: payload.meta?.customer_email ?? null,
    orderId: payload.meta?.order_id != null ? String(payload.meta.order_id) : null,
    productName: payload.meta?.product_name ?? null,
    variantId: payload.meta?.variant_id != null ? String(payload.meta.variant_id) : null,
    error: payload.error ?? null,
  };
}

/** Map a Lemon Squeezy variant ID back to the plan it sells. */
export function planIdForVariant(variantId: string): 'single' | 'pack' | 'agency' | null {
  const config = lemonSqueezyConfig();
  if (String(config.variants.single) === String(variantId)) return 'single';
  if (String(config.variants.pack) === String(variantId)) return 'pack';
  if (String(config.variants.agency) === String(variantId)) return 'agency';
  return null;
}

/** The webhook payload shapes this app consumes. */
export interface WebhookEvent {
  meta: {
    event_name: string;
    custom_data?: Record<string, string>;
  };
  data: {
    id: string;
    type: string;
    attributes: Record<string, unknown>;
  };
}

export function parseWebhookEvent(rawBody: string): WebhookEvent | null {
  try {
    const parsed = JSON.parse(rawBody) as WebhookEvent;
    if (!parsed?.meta?.event_name || !parsed?.data) return null;
    return parsed;
  } catch {
    return null;
  }
}
