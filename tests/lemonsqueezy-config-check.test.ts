import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '@/lib/env';

/**
 * The Lemon Squeezy configuration diagnostic.
 *
 * Written against a mocked API because the defect it catches is a mismatch
 * between two systems, and a test that talked to the real store would only
 * ever assert today's configuration. What matters is that each kind of
 * mismatch is detected and described.
 */

const VARIANTS: Record<string, { name: string; licenseKeys: boolean; status?: string }> = {
  '1001': { name: 'Starter', licenseKeys: true },
  '1002': { name: 'Growth', licenseKeys: true },
  '1003': { name: 'Agency Pro', licenseKeys: true },
};

const PRICES: Record<string, { unit_price: number; category: string; unit?: string }> = {
  '1001': { unit_price: 2900, category: 'one_time' },
  '1002': { unit_price: 7900, category: 'one_time' },
  '1003': { unit_price: 19900, category: 'one_time' },
};

function mockApi() {
  return vi.fn(async (url: string | URL) => {
    const href = typeof url === 'string' ? url : url.toString();

    if (href.includes('/stores/')) {
      return json({ data: { attributes: { name: 'Crawlable', currency: 'USD' } } });
    }

    const productMatch = href.match(/\/variants\/(\d+)\/product/);
    if (productMatch) {
      const variant = VARIANTS[productMatch[1]!];
      if (!variant) return notFound();
      return json({ data: { attributes: { name: `${variant.name} product` } } });
    }

    const priceMatch = href.match(/filter\[variant_id\]=(\d+)/);
    if (priceMatch) {
      const price = PRICES[priceMatch[1]!];
      if (!price) return json({ data: [] });
      return json({
        data: [
          {
            attributes: {
              unit_price: price.unit_price,
              category: price.category,
              ...(price.unit ? { renewal_interval_unit: price.unit, renewal_interval_quantity: 1 } : {}),
            },
          },
        ],
      });
    }

    const variantMatch = href.match(/\/variants\/(\d+)$/);
    if (variantMatch) {
      const variant = VARIANTS[variantMatch[1]!];
      if (!variant) return notFound();
      return json({
        data: {
          attributes: {
            name: variant.name,
            has_license_keys: variant.licenseKeys,
            status: variant.status ?? 'published',
          },
        },
      });
    }

    return notFound();
  });
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}
function notFound() {
  return new Response(JSON.stringify({ errors: [{ detail: 'Not found' }] }), { status: 404 });
}

function configure(overrides: Record<string, string> = {}) {
  const base = {
    LEMONSQUEEZY_API_KEY: 'test-key',
    LEMONSQUEEZY_STORE_ID: '479102',
    LEMONSQUEEZY_WEBHOOK_SECRET: 'whsec',
    LEMONSQUEEZY_VARIANT_SINGLE: '1001',
    LEMONSQUEEZY_VARIANT_PACK: '1002',
    LEMONSQUEEZY_VARIANT_AGENCY: '1003',
    ...overrides,
  };
  for (const [key, value] of Object.entries(base)) vi.stubEnv(key, value);
  resetEnvCache();
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockApi());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetEnvCache();
  // Restore the catalogue for tests that mutated the fixtures.
  VARIANTS['1003'] = { name: 'Agency Pro', licenseKeys: true };
  PRICES['1003'] = { unit_price: 19900, category: 'one_time' };
});

async function check() {
  const { checkLemonSqueezyConfig } = await import('@/lib/lemonsqueezy-config-check');
  return checkLemonSqueezyConfig();
}

describe('checkLemonSqueezyConfig', () => {
  it('reports ok when every variant matches the catalogue', async () => {
    configure();
    const result = await check();

    expect(result.status).toBe('ok');
    expect(result.currency).toBe('USD');
    expect(result.storeName).toBe('Crawlable');
    expect(result.variants).toHaveLength(3);
    for (const variant of result.variants) {
      expect(variant.ok, `${variant.planName}: ${variant.problems.join('; ')}`).toBe(true);
    }
  });

  it('reads back the live name, price and billing for each variant', async () => {
    configure();
    const result = await check();
    const agency = result.variants.find((v) => v.plan === 'agency');

    expect(agency?.live?.variantName).toBe('Agency Pro');
    expect(agency?.live?.productName).toBe('Agency Pro product');
    expect(agency?.live?.priceUsd).toBe(199);
    expect(agency?.live?.priceFormatted).toBe('199.00 USD');
    expect(agency?.live?.billingCategory).toBe('one_time');
    expect(agency?.live?.licenseKeysEnabled).toBe(true);
  });

  it('flags a price that disagrees with the advertised price', async () => {
    // The exact case this was built for: the site says $199, the store charges
    // the old subscription rate.
    PRICES['1003'] = { unit_price: 2900, category: 'one_time' };
    configure();
    const result = await check();

    expect(result.status).toBe('mismatch');
    const agency = result.variants.find((v) => v.plan === 'agency');
    expect(agency?.ok).toBe(false);
    expect(agency?.problems.join(' ')).toMatch(/Price is 29.00 USD but the site advertises \$199/);
    expect(agency?.problems.join(' ')).toMatch(/charged another/);
  });

  it('flags a variant still configured as a subscription', async () => {
    PRICES['1003'] = { unit_price: 19900, category: 'subscription', unit: 'month' };
    configure();
    const result = await check();

    const agency = result.variants.find((v) => v.plan === 'agency');
    expect(result.status).toBe('mismatch');
    expect(agency?.problems.join(' ')).toMatch(/Billing is "subscription" but should be "one_time"/);
    expect(agency?.problems.join(' ')).toMatch(/renews every month/);
  });

  it('flags license key generation being off', async () => {
    // Silent and total: no key means the buyer receives nothing.
    VARIANTS['1003'] = { name: 'Agency Pro', licenseKeys: false };
    configure();
    const result = await check();

    const agency = result.variants.find((v) => v.plan === 'agency');
    expect(result.status).toBe('mismatch');
    expect(agency?.problems.join(' ')).toMatch(/License key generation is OFF/);
    expect(agency?.problems.join(' ')).toMatch(/receives nothing/);
  });

  it('flags an unpublished variant', async () => {
    VARIANTS['1003'] = { name: 'Agency Pro', licenseKeys: true, status: 'draft' };
    configure();
    const result = await check();

    expect(result.variants.find((v) => v.plan === 'agency')?.problems.join(' ')).toMatch(
      /status is "draft"/,
    );
  });

  it('flags a variant ID that does not resolve', async () => {
    // A stale ID after a subscription-to-one-time change is exactly this.
    configure({ LEMONSQUEEZY_VARIANT_AGENCY: '9999' });
    const result = await check();

    const agency = result.variants.find((v) => v.plan === 'agency');
    expect(result.status).toBe('mismatch');
    expect(agency?.live).toBeNull();
    expect(agency?.problems.join(' ')).toMatch(/could not be read from Lemon Squeezy/);
  });

  it('names the environment variable to fix', async () => {
    configure({ LEMONSQUEEZY_VARIANT_PACK: '9999' });
    const result = await check();
    const growth = result.variants.find((v) => v.plan === 'pack');
    expect(growth?.envVar).toBe('LEMONSQUEEZY_VARIANT_PACK');
  });

  it('errors cleanly when Lemon Squeezy is not configured at all', async () => {
    // Nothing stubbed: the variables are simply absent, which is the state a
    // fresh deployment is in. The check must report that rather than throw
    // and take the endpoint down with a 500.
    resetEnvCache();
    const result = await check();

    expect(result.status).toBe('error');
    expect(result.error).toMatch(/Lemon Squeezy is not configured/i);
    expect(result.error).toMatch(/LEMONSQUEEZY_API_KEY/);
    expect(result.variants).toHaveLength(0);
  });

  it('errors cleanly when a variable is present but empty', async () => {
    // Zod rejects an empty string before lemonSqueezyConfig runs, so this
    // surfaces as an environment validation failure. Either way the caller
    // gets a description, not a stack trace.
    vi.stubEnv('LEMONSQUEEZY_API_KEY', '');
    resetEnvCache();
    const result = await check();

    expect(result.status).toBe('error');
    expect(result.error).toMatch(/LEMONSQUEEZY_API_KEY/);
    expect(result.variants).toHaveLength(0);
  });

  it('never echoes the API key', async () => {
    configure();
    const result = await check();
    expect(JSON.stringify(result)).not.toContain('test-key');
  });

  it('says where the price figure came from', async () => {
    configure();
    const result = await check();
    // The deprecated variant price field and the "newest record" caveat are
    // both real limitations; the response states them rather than implying
    // more certainty than the API offers.
    expect(result.notes.join(' ')).toMatch(/deprecated/);
    expect(result.notes.join(' ')).toMatch(/newest first/);
  });
});
