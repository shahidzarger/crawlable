import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '@/lib/env';

/**
 * The guard on the diagnostic endpoint.
 *
 * Unauthenticated, this route would publish the store's product names, prices
 * and configuration to anyone who guessed the path. These assertions are
 * about refusal, so they matter more than the ones about the happy path.
 */

const SECRET = 'a-sufficiently-long-cron-secret';

/*
 * `null` means "no CRON_SECRET at all". Deliberately not `undefined`: passing
 * undefined to a parameter with a default re-triggers the default, which
 * quietly configured the real secret and made the fail-closed test pass for
 * the wrong reason.
 */
function configure(secret: string | null = SECRET) {
  if (secret === null) {
    vi.stubEnv('CRON_SECRET', undefined as unknown as string);
  } else {
    vi.stubEnv('CRON_SECRET', secret);
  }
  vi.stubEnv('LEMONSQUEEZY_API_KEY', 'test-key');
  vi.stubEnv('LEMONSQUEEZY_STORE_ID', '479102');
  vi.stubEnv('LEMONSQUEEZY_WEBHOOK_SECRET', 'whsec');
  vi.stubEnv('LEMONSQUEEZY_VARIANT_SINGLE', '1001');
  vi.stubEnv('LEMONSQUEEZY_VARIANT_PACK', '1002');
  vi.stubEnv('LEMONSQUEEZY_VARIANT_AGENCY', '1003');
  resetEnvCache();
}

/** A store where everything matches, so the guard is what the test isolates. */
function healthyApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const href = typeof url === 'string' ? url : url.toString();
      const body = href.includes('/stores/')
        ? { data: { attributes: { name: 'Crawlable', currency: 'USD' } } }
        : href.includes('/product')
          ? { data: { attributes: { name: 'Product' } } }
          : href.includes('filter[variant_id]=1001')
            ? { data: [{ attributes: { unit_price: 2900, category: 'one_time' } }] }
            : href.includes('filter[variant_id]=1002')
              ? { data: [{ attributes: { unit_price: 7900, category: 'one_time' } }] }
              : href.includes('filter[variant_id]=1003')
                ? { data: [{ attributes: { unit_price: 19900, category: 'one_time' } }] }
                : { data: { attributes: { name: 'V', has_license_keys: true, status: 'published' } } };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

async function get(url: string, headers: Record<string, string> = {}) {
  const { GET } = await import('@/app/api/health/lemonsqueezy/route');
  return GET(new Request(url, { headers }));
}

beforeEach(() => {
  healthyApi();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetEnvCache();
});

describe('GET /api/health/lemonsqueezy', () => {
  it('refuses without a secret', async () => {
    configure();
    const response = await get('https://x.test/api/health/lemonsqueezy');
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'Unauthorized' });
  });

  it('refuses a wrong secret', async () => {
    configure();
    const response = await get('https://x.test/api/health/lemonsqueezy?key=nope');
    expect(response.status).toBe(401);
  });

  it('refuses a secret that is a prefix of the real one', async () => {
    // The length check must not be a way in.
    configure();
    const response = await get(
      `https://x.test/api/health/lemonsqueezy?key=${SECRET.slice(0, 10)}`,
    );
    expect(response.status).toBe(401);
  });

  it('disables itself rather than opening when CRON_SECRET is unset', async () => {
    // Failing closed is the whole point: an unset secret must never mean
    // "no authentication required".
    configure(null);
    const response = await get('https://x.test/api/health/lemonsqueezy');
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/CRON_SECRET is not configured/);
  });

  it('leaks nothing in an unauthorised response', async () => {
    configure();
    const body = await (await get('https://x.test/api/health/lemonsqueezy')).text();
    expect(body).not.toContain('Crawlable');
    expect(body).not.toContain('1003');
    expect(body).not.toContain('test-key');
    expect(body).not.toContain(SECRET);
  });

  it('accepts the bearer header', async () => {
    configure();
    const response = await get('https://x.test/api/health/lemonsqueezy', {
      Authorization: `Bearer ${SECRET}`,
    });
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('ok');
  });

  it('accepts ?key= so the check can be run from a browser', async () => {
    configure();
    const response = await get(
      `https://x.test/api/health/lemonsqueezy?key=${encodeURIComponent(SECRET)}`,
    );
    expect(response.status).toBe(200);
  });

  it('answers 503 on a mismatch so it works as an uptime check', async () => {
    configure();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const href = typeof url === 'string' ? url : url.toString();
        const body = href.includes('/stores/')
          ? { data: { attributes: { name: 'Crawlable', currency: 'USD' } } }
          : href.includes('/product')
            ? { data: { attributes: { name: 'Product' } } }
            : href.includes('filter[variant_id]')
              ? { data: [{ attributes: { unit_price: 100, category: 'one_time' } }] }
              : { data: { attributes: { name: 'V', has_license_keys: true, status: 'published' } } };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );

    const response = await get('https://x.test/api/health/lemonsqueezy', {
      Authorization: `Bearer ${SECRET}`,
    });
    expect(response.status).toBe(503);
    expect((await response.json()).status).toBe('mismatch');
  });

  it('is never cached', async () => {
    configure();
    const response = await get('https://x.test/api/health/lemonsqueezy', {
      Authorization: `Bearer ${SECRET}`,
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
