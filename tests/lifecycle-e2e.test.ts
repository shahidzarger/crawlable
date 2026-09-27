import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '@/lib/env';
import { hashLicenseKey } from '@/lib/lemonsqueezy';
import { PLANS, planById } from '@/lib/plans';
import type { PlanId } from '@/lib/db/types';

/**
 * The paid lifecycle, end to end, against the real route handlers.
 *
 * Purchase settles through the webhook, entitlements are granted from the plan
 * catalogue, an audit spends a scan, a re-scan spends another and is refused
 * once the quota or the window is gone, and the Fix Kit downloads as a zip and
 * as individual files. Every assertion goes through the routes a customer's
 * request would, not through the helpers underneath them, because the defects
 * worth catching here live in the wiring.
 *
 * Two facts about the real flow that the brief did not anticipate, and that
 * this suite encodes rather than works around:
 *
 *   1. order_created does NOT create a licence. It has no licence key — it
 *      carries the variant ID, which is recorded so the key event can resolve
 *      the plan. The entitlement is granted by license_key_created.
 *   2. The webhook lives at /api/webhooks/lemonsqueezy.
 */

const SECRET = 'test-webhook-secret';
const VARIANTS: Record<PlanId, string> = {
  single: '1001',
  pack: '1002',
  agency: '1003',
};

/** What each tier must grant, per the brief. Read back from the catalogue. */
const EXPECTED: Record<PlanId, { scans: number; windowDays: number; domains: number }> = {
  single: { scans: 3, windowDays: 30, domains: 1 },
  pack: { scans: 10, windowDays: 60, domains: 3 },
  agency: { scans: 50, windowDays: 60, domains: 15 },
};

function configure() {
  vi.stubEnv('LEMONSQUEEZY_API_KEY', 'test-key');
  vi.stubEnv('LEMONSQUEEZY_STORE_ID', '479102');
  vi.stubEnv('LEMONSQUEEZY_WEBHOOK_SECRET', SECRET);
  vi.stubEnv('LEMONSQUEEZY_VARIANT_SINGLE', VARIANTS.single);
  vi.stubEnv('LEMONSQUEEZY_VARIANT_PACK', VARIANTS.pack);
  vi.stubEnv('LEMONSQUEEZY_VARIANT_AGENCY', VARIANTS.agency);
  /*
   * Removed, not blanked. RESEND_API_KEY is `z.string().min(1).optional()`,
   * so an empty string fails validation and env() throws — which the webhook
   * route catches and answers 503 to, making every test in this file fail for
   * a reason unrelated to what it was asserting. Absent means email is
   * skipped, which is what was wanted.
   */
  vi.stubEnv('RESEND_API_KEY', undefined as unknown as string);
  resetEnvCache();
}

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');
}

async function postWebhook(payload: unknown): Promise<Response> {
  const { POST } = await import('@/app/api/webhooks/lemonsqueezy/route');
  const body = JSON.stringify(payload);
  return POST(
    new Request('https://x.test/api/webhooks/lemonsqueezy', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-signature': sign(body) },
      body,
    }),
  );
}

function orderCreated(plan: PlanId, orderId: string) {
  return {
    meta: { event_name: 'order_created' },
    data: {
      id: orderId,
      type: 'orders',
      attributes: {
        user_email: 'buyer@example.invalid',
        status: 'paid',
        first_order_item: {
          variant_id: VARIANTS[plan],
          product_name: planById(plan)?.name,
        },
      },
    },
  };
}

function licenseKeyCreated(key: string, orderId: string) {
  return {
    // No custom_data: this is the bare-buy-link case, so the plan must come
    // from the order_plans row that order_created wrote.
    meta: { event_name: 'license_key_created' },
    data: {
      id: `lk-${orderId}`,
      type: 'license-keys',
      attributes: {
        key,
        status: 'inactive',
        order_id: orderId,
        user_email: 'buyer@example.invalid',
      },
    },
  };
}

/** Buy a plan the way Lemon Squeezy delivers it: order first, then the key. */
async function purchase(plan: PlanId, key: string, orderId: string) {
  expect((await postWebhook(orderCreated(plan, orderId))).status).toBe(200);
  expect((await postWebhook(licenseKeyCreated(key, orderId))).status).toBe(200);
  const { store } = await import('@/lib/db');
  return (await (await store()).getLicense(hashLicenseKey(key)))!;
}

/** A crawl that needs no network: two readable pages on one origin. */
function stubCrawl() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        '<!doctype html><html><head><title>Example</title><meta name="description" content="A page."></head>' +
          '<body><h1>Example</h1><p>' +
          'Readable body copy that a non-rendering crawler can see. '.repeat(20) +
          '</p><a href="/second">Second</a></body></html>',
        { status: 200, headers: { 'content-type': 'text/html' } },
      ),
    ),
  );
}

async function runAuditRequest(key: string, url: string): Promise<Response> {
  const { POST } = await import('@/app/api/audit/route');
  return POST(
    new Request('https://x.test/api/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ url, maxPages: 2, notify: false }),
    }),
  );
}

async function download(key: string, auditId: string, query: string): Promise<Response> {
  const { GET } = await import('@/app/api/audit/[id]/download/route');
  return GET(
    new Request(`https://x.test/api/audit/${auditId}/download?${query}`, {
      headers: { authorization: `Bearer ${key}` },
    }),
    { params: Promise.resolve({ id: auditId }) },
  );
}

beforeEach(async () => {
  configure();
  // A fresh store per test, so a licence, its domains and its usage cannot
  // leak between cases and make an assertion pass for the wrong reason.
  const { __setStore } = await import('@/lib/db');
  const { MemoryStore } = await import('@/lib/db/memory');
  __setStore(new MemoryStore());
});

afterEach(async () => {
  const { __setStore } = await import('@/lib/db');
  __setStore(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetEnvCache();
});

describe('settlement: webhook to entitlement', () => {
  for (const plan of PLANS) {
    it(`grants ${plan.name} its quota, domains and window`, async () => {
      const expected = EXPECTED[plan.id];
      const before = Date.now();
      const license = await purchase(plan.id, `KEY-${plan.id}-${Date.now()}`, `ord-${plan.id}`);

      expect(license.plan).toBe(plan.id);
      expect(license.status).toBe('active');
      expect(license.totalScansAllowed, 'scans').toBe(expected.scans);
      expect(license.scansUsed).toBe(0);
      expect(license.targetDomain).toBeNull();

      // Quotas come from lib/plans.ts, never from the payload.
      expect(plan.totalScansAllowed).toBe(expected.scans);
      expect(plan.domainSlots).toBe(expected.domains);
      expect(plan.windowDays).toBe(expected.windowDays);

      const expiry = Date.parse(license.expiresAt!);
      const days = (expiry - before) / 86_400_000;
      expect(days, 'window in days').toBeGreaterThan(expected.windowDays - 0.01);
      expect(days).toBeLessThan(expected.windowDays + 0.01);
    });
  }

  it('resolves the plan from the variant ID with no checkout metadata', async () => {
    // A purchase through a bare Lemon Squeezy buy link carries no custom_data.
    // Before order_plans existed this was an orphaned purchase.
    const license = await purchase('agency', 'KEY-BARE-LINK', 'ord-bare');
    expect(license.plan).toBe('agency');
    expect(license.totalScansAllowed).toBe(50);
  });

  it('rejects an unsigned or wrongly signed delivery', async () => {
    const { POST } = await import('@/app/api/webhooks/lemonsqueezy/route');
    const body = JSON.stringify(orderCreated('single', 'ord-forged'));

    const unsigned = await POST(
      new Request('https://x.test/api/webhooks/lemonsqueezy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }),
    );
    expect(unsigned.status).toBe(401);

    const forged = await POST(
      new Request('https://x.test/api/webhooks/lemonsqueezy', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-signature': sign('different') },
        body,
      }),
    );
    expect(forged.status).toBe(401);
  });

  it('is idempotent: a redelivered key does not reset usage', async () => {
    const key = 'KEY-REDELIVERED';
    await purchase('pack', key, 'ord-redeliver');

    const { store } = await import('@/lib/db');
    const db = await store();
    const hash = hashLicenseKey(key);
    await db.consumeScan(hash);
    expect((await db.getLicense(hash))!.scansUsed).toBe(1);

    // Lemon Squeezy retries on any non-2xx.
    await postWebhook(licenseKeyCreated(key, 'ord-redeliver'));

    expect((await db.getLicense(hash))!.scansUsed, 'usage must survive a retry').toBe(1);
  });
});

describe('audit and verification re-scan', () => {
  it('spends a scan, binds the domain, and reports the remaining balance', async () => {
    stubCrawl();
    const key = 'KEY-AUDIT-FLOW';
    await purchase('single', key, 'ord-audit');

    const first = await runAuditRequest(key, 'https://example.com');
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { audit: { id: string; score: number }; scansRemaining: number };
    expect(firstBody.scansRemaining).toBe(2);

    const { store } = await import('@/lib/db');
    const license = (await (await store()).getLicense(hashLicenseKey(key)))!;
    expect(license.scansUsed).toBe(1);
    expect(license.targetDomain).toBe('example.com');

    // The re-scan: same domain, no payment, one more scan spent.
    const second = await runAuditRequest(key, 'https://example.com');
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { audit: { id: string; score: number }; scansRemaining: number };
    expect(secondBody.scansRemaining).toBe(1);

    // Before-and-after: two reports on one domain, each with its own score,
    // which is what the delta card on the report page compares.
    expect(secondBody.audit.id).not.toBe(firstBody.audit.id);
    expect(typeof firstBody.audit.score).toBe('number');
    expect(typeof secondBody.audit.score).toBe('number');
  });

  it('refuses once the scans are gone', async () => {
    stubCrawl();
    const key = 'KEY-EXHAUSTED';
    await purchase('single', key, 'ord-exhausted');

    for (let i = 0; i < 3; i += 1) {
      expect((await runAuditRequest(key, 'https://example.com')).status).toBe(200);
    }

    const refused = await runAuditRequest(key, 'https://example.com');
    expect(refused.status).toBe(402);
    const body = (await refused.json()) as { code: string; error: string };
    expect(body.code).toBe('NO_SCANS_REMAINING');
    expect(body.error).toMatch(/All 3 scans/);
  });

  it('refuses once the window has closed, and says so distinctly', async () => {
    stubCrawl();
    const key = 'KEY-EXPIRED';
    await purchase('pack', key, 'ord-expired');

    /*
     * The expiry is moved by re-inserting the licence into a fresh store.
     *
     * upsertLicense preserves expires_at on an EXISTING row — it must, or a
     * redelivered webhook would extend a customer's window — so the only
     * honest way to simulate a closed window is to insert the record as if it
     * had been granted that way.
     */
    const { store, __setStore } = await import('@/lib/db');
    const hash = hashLicenseKey(key);
    const license = (await (await store()).getLicense(hash))!;

    const { MemoryStore } = await import('@/lib/db/memory');
    const fresh = new MemoryStore();
    __setStore(fresh);
    await fresh.upsertLicense({
      ...license,
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
    });

    const refused = await runAuditRequest(key, 'https://example.com');
    expect(refused.status).toBe(402);
    const body = (await refused.json()) as { code: string; error: string };
    // Distinct from exhaustion: the two lead to different next steps.
    expect(body.code).toBe('WINDOW_CLOSED');
    expect(body.error).toMatch(/window closed/i);
  });

  it('holds a single-domain licence to its bound domain', async () => {
    stubCrawl();
    const key = 'KEY-DOMAIN-LOCK';
    await purchase('single', key, 'ord-lock');

    expect((await runAuditRequest(key, 'https://example.com')).status).toBe(200);

    const other = await runAuditRequest(key, 'https://different.com');
    expect(other.status).toBe(403);
    const body = (await other.json()) as { code: string; error: string };
    expect(body.code).toBe('DOMAIN_LOCKED');
    expect(body.error).toMatch(/example\.com/);

    // And the refused attempt must not have cost a scan.
    const { store } = await import('@/lib/db');
    expect((await (await store()).getLicense(hashLicenseKey(key)))!.scansUsed).toBe(1);
  });

  it('lets a multi-domain licence spend slots and then refuses a new one', async () => {
    stubCrawl();
    const key = 'KEY-SLOTS';
    await purchase('pack', key, 'ord-slots');

    for (const host of ['one.com', 'two.com', 'three.com']) {
      expect((await runAuditRequest(key, `https://${host}`)).status).toBe(200);
    }

    const fourth = await runAuditRequest(key, 'https://four.com');
    expect(fourth.status).toBe(403);
    expect((await fourth.json()).code).toBe('DOMAIN_LIMIT_REACHED');

    // A registered domain is still re-scannable.
    expect((await runAuditRequest(key, 'https://two.com')).status).toBe(200);
  });
});

describe('Fix Kit delivery', () => {
  async function boughtAndAudited() {
    stubCrawl();
    const key = `KEY-KIT-${Date.now()}`;
    await purchase('pack', key, `ord-kit-${Date.now()}`);
    const response = await runAuditRequest(key, 'https://example.com');
    const body = (await response.json()) as { audit: { id: string } };
    return { key, auditId: body.audit.id };
  }

  it('delivers a zip containing all five files', async () => {
    const { key, auditId } = await boughtAndAudited();
    const response = await download(key, auditId, 'format=zip');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toMatch(/\.zip"$/);

    const archive = Buffer.from(await response.arrayBuffer());
    expect(archive.length).toBeGreaterThan(0);
    // PK\x03\x04 — a real local file header, not an empty or truncated body.
    expect(archive.subarray(0, 4).toString('latin1')).toBe('PK\u0003\u0004');

    const { FIX_KIT_FILES } = await import('@/lib/audit/file-manifest');
    const text = archive.toString('latin1');
    for (const file of FIX_KIT_FILES) {
      expect(text, file.name).toContain(file.name);
    }
  });

  it('delivers every file individually with its declared content type', async () => {
    const { key, auditId } = await boughtAndAudited();
    const { FIX_KIT_FILES } = await import('@/lib/audit/file-manifest');

    for (const file of FIX_KIT_FILES) {
      const response = await download(key, auditId, `file=${encodeURIComponent(file.name)}`);
      expect(response.status, file.name).toBe(200);
      expect(response.headers.get('content-type'), file.name).toBe(file.contentType);
      const body = await response.text();
      expect(body.length, file.name).toBeGreaterThan(50);
    }
  });

  it('serves a valid sitemap and a sectioned llms.txt', async () => {
    const { key, auditId } = await boughtAndAudited();

    const sitemap = await (await download(key, auditId, 'file=sitemap.xml')).text();
    expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(sitemap).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);

    const llms = await (await download(key, auditId, 'file=llms.txt')).text();
    expect(llms).toMatch(/^# /m);
    expect(llms).toMatch(/^> /m);
    expect(llms).toMatch(/^## /m);
  });

  it('refuses a licence that does not own the report', async () => {
    const { auditId } = await boughtAndAudited();
    const otherKey = 'KEY-STRANGER';
    await purchase('single', otherKey, 'ord-stranger');

    const response = await download(otherKey, auditId, 'format=zip');
    expect(response.status).toBe(403);
  });
});
