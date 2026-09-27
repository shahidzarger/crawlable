import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '@/lib/env';
import { PAGE_LIMITS } from '@/lib/audit/types-limits';

/**
 * The public-beta flag, and the boundary it must not move.
 *
 * The flag widens the diagnostic. Everything here that matters is an
 * assertion that it does NOT widen the deliverable: the Fix Kit is absent
 * from the response, absent from the stored record, and refused by the
 * download route for a report no licence owns.
 */

function html(body: string) {
  return new Response(
    `<!doctype html><html><head><title>T</title><meta name="description" content="D"></head><body><h1>H</h1><p>${body}</p></body></html>`,
    { status: 200, headers: { 'content-type': 'text/html' } },
  );
}

function stubNetwork() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const href = typeof url === 'string' ? url : url.toString();
      if (href.endsWith('/robots.txt')) {
        return new Response('User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      }
      if (href.endsWith('/sitemap.xml')) {
        const urls = Array.from(
          { length: 12 },
          (_, i) => `<url><loc>https://example.com/p${i + 1}</loc></url>`,
        ).join('');
        return new Response(
          `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
          { status: 200, headers: { 'content-type': 'application/xml' } },
        );
      }
      if (href.endsWith('/llms.txt')) return new Response('', { status: 404 });
      return html('Readable copy for a crawler to measure. '.repeat(20));
    }),
  );
}

async function scan(url = 'https://example.com') {
  const { POST } = await import('@/app/api/scan/route');
  return POST(
    new Request('https://x.test/api/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    }),
  );
}

function setFlag(on: boolean) {
  vi.stubEnv('NEXT_PUBLIC_BETA_FREE_DEEP_AUDIT', on ? 'true' : 'false');
  resetEnvCache();
}

beforeEach(async () => {
  stubNetwork();
  const { __setStore } = await import('@/lib/db');
  const { MemoryStore } = await import('@/lib/db/memory');
  __setStore(new MemoryStore());
  vi.resetModules();
});

afterEach(async () => {
  const { __setStore } = await import('@/lib/db');
  __setStore(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetEnvCache();
});

describe('the flag defaults to off', () => {
  it('treats absent, empty and misspelt values as off', async () => {
    for (const value of [undefined, '', 'false', 'TRUE', '1', 'yes']) {
      vi.stubEnv('NEXT_PUBLIC_BETA_FREE_DEEP_AUDIT', value as unknown as string);
      vi.resetModules();
      const { betaFreeDeepAudit } = await import('@/lib/config');
      // A flag that gives the product away on a typo is worse than no flag.
      expect(betaFreeDeepAudit(), String(value)).toBe(false);
    }

    vi.stubEnv('NEXT_PUBLIC_BETA_FREE_DEEP_AUDIT', 'true');
    vi.resetModules();
    const { betaFreeDeepAudit } = await import('@/lib/config');
    expect(betaFreeDeepAudit()).toBe(true);
  });

  it('caps the free run at one page when off and forty when on', async () => {
    setFlag(false);
    vi.resetModules();
    let mod = await import('@/lib/config');
    expect(mod.freeAuditPageLimit()).toBe(PAGE_LIMITS.scan);

    setFlag(true);
    vi.resetModules();
    mod = await import('@/lib/config');
    expect(mod.freeAuditPageLimit()).toBe(PAGE_LIMITS.audit);
    expect(mod.freeAuditPageLimit()).toBe(40);
  });

  it('tightens the rate limit for deep runs', async () => {
    // Eight 40-page crawls per IP per hour would be 320 requests aimed at a
    // domain the caller chooses. The deep allowance is deliberately lower.
    setFlag(false);
    vi.resetModules();
    expect((await import('@/lib/config')).freeAuditRateLimit().limit).toBe(8);

    setFlag(true);
    vi.resetModules();
    const deep = (await import('@/lib/config')).freeAuditRateLimit();
    expect(deep.limit).toBeLessThan(8);
    expect(deep.windowSeconds).toBe(3600);
  });
});

describe('with the flag off', () => {
  beforeEach(() => setFlag(false));

  it('audits one page and records it as a scan', async () => {
    const response = await scan();
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      scan: { id: string; pagesAudited: number };
      deep: boolean;
    };

    expect(body.deep).toBe(false);
    expect(body.scan.pagesAudited).toBe(1);

    const { store } = await import('@/lib/db');
    const record = await (await store()).getAudit(body.scan.id);
    expect(record?.mode).toBe('scan');
  });
});

describe('with the flag on', () => {
  beforeEach(() => setFlag(true));

  it('crawls many pages for a visitor with no licence', async () => {
    const response = await scan();
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      scan: { id: string; pagesAudited: number; discovery?: { source: string } };
      deep: boolean;
    };

    expect(body.deep).toBe(true);
    expect(body.scan.pagesAudited, 'more than the entry page').toBeGreaterThan(1);
    expect(body.scan.pagesAudited).toBeLessThanOrEqual(PAGE_LIMITS.audit);
    expect(body.scan.discovery?.source).toBe('sitemap');
  });

  it('never returns the Fix Kit in the response', async () => {
    const response = await scan();
    const raw = await response.text();
    const body = JSON.parse(raw) as { scan: Record<string, unknown> };

    expect(body.scan.generated, 'generated must be redacted').toBeUndefined();
    // Belt and braces on the wire format itself.
    expect(raw).not.toContain('FIXES.md');
    expect(raw).not.toContain('schema.jsonld');
  });

  it('never stores the Fix Kit either', async () => {
    // The response being clean is not enough: if the kit sits in the record,
    // the only thing between it and a visitor is a route guard.
    const body = (await (await scan()).json()) as { scan: { id: string } };

    const { store } = await import('@/lib/db');
    const record = await (await store()).getAudit(body.scan.id);

    expect(record).toBeDefined();
    expect(record!.mode, 'the real mode, so the report shows full metrics').toBe('audit');
    expect(record!.licenseKeyHash, 'no owning licence').toBeNull();
    expect(record!.result.generated, 'the kit must not be persisted').toBeUndefined();
  });

  it('refuses the zip for a report no licence owns', async () => {
    const body = (await (await scan()).json()) as { scan: { id: string } };

    // A real, active licence — just not one that owns this report.
    const { recordLicense } = await import('@/lib/licensing');
    const key = 'KEY-BETA-STRANGER';
    await recordLicense({
      licenseKey: key,
      plan: 'agency',
      email: 'buyer@example.invalid',
      orderId: 'ord-beta',
      status: 'active',
    });

    const { GET } = await import('@/app/api/audit/[id]/download/route');
    const response = await GET(
      new Request(`https://x.test/api/audit/${body.scan.id}/download?format=zip`, {
        headers: { authorization: `Bearer ${key}` },
      }),
      { params: Promise.resolve({ id: body.scan.id }) },
    );

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { code: string; error: string };
    expect(payload.code).toBe('no-entitlement');
    expect(payload.error).toMatch(/free tier/i);
  });

  it('refuses individual files for an unowned report too', async () => {
    const body = (await (await scan()).json()) as { scan: { id: string } };
    const { recordLicense } = await import('@/lib/licensing');
    const key = 'KEY-BETA-FILES';
    await recordLicense({
      licenseKey: key,
      plan: 'pack',
      email: 'buyer@example.invalid',
      orderId: 'ord-beta-files',
      status: 'active',
    });

    const { GET } = await import('@/app/api/audit/[id]/download/route');
    const { FIX_KIT_FILES } = await import('@/lib/audit/file-manifest');

    for (const file of FIX_KIT_FILES) {
      const response = await GET(
        new Request(
          `https://x.test/api/audit/${body.scan.id}/download?file=${encodeURIComponent(file.name)}`,
          { headers: { authorization: `Bearer ${key}` } },
        ),
        { params: Promise.resolve({ id: body.scan.id }) },
      );
      expect(response.status, file.name).toBe(403);
    }
  });

  it('still refuses an anonymous download', async () => {
    const body = (await (await scan()).json()) as { scan: { id: string } };
    const { GET } = await import('@/app/api/audit/[id]/download/route');
    const response = await GET(
      new Request(`https://x.test/api/audit/${body.scan.id}/download?format=zip`),
      { params: Promise.resolve({ id: body.scan.id }) },
    );
    // No key at all: rejected by authentication, before ownership.
    expect([401, 403]).toContain(response.status);
  });

  it('respects the rate limit', async () => {
    const { freeAuditRateLimit } = await import('@/lib/config');
    const { limit } = freeAuditRateLimit();

    for (let i = 0; i < limit; i += 1) {
      expect((await scan()).status, `run ${i + 1}`).toBe(200);
    }

    const blocked = await scan();
    expect(blocked.status).toBe(429);
  });
});
