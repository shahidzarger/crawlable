import { describe, expect, it } from 'vitest';
import { normaliseDomain } from '@/lib/domains';
import { PLANS, planById } from '@/lib/plans';

/**
 * A small limit for the mechanism tests below.
 *
 * Deliberately a literal rather than a plan's allowance: these assertions are
 * about how claimDomain behaves at its boundary, and pinning them to Agency
 * Pro's 15 would mean rewriting the test every time the plan changes — and
 * claiming fifteen domains to prove the sixteenth is refused.
 */
const LIMIT = 3;
import { MemoryStore } from '@/lib/db/memory';

/**
 * Agency Pro sells three websites, not three audits. Two properties decide
 * whether that promise holds: a re-audit of a registered site must never cost
 * a slot, and the slot count must never exceed what was sold.
 */

describe('normaliseDomain', () => {
  it('reduces a full URL to its bare hostname', () => {
    expect(normaliseDomain('https://www.example.com/pricing?a=1')).toBe('example.com');
    expect(normaliseDomain('http://example.com:8443/path')).toBe('example.com');
    expect(normaliseDomain('example.com')).toBe('example.com');
  });

  it('collapses the spellings a customer would expect to be one site', () => {
    // These four must all land on the same slot, or a single client site
    // silently burns the whole allowance.
    const forms = [
      'example.com',
      'www.example.com',
      'https://www.example.com',
      'HTTPS://WWW.EXAMPLE.COM/',
    ];
    const normalised = new Set(forms.map((form) => normaliseDomain(form)));
    expect(normalised.size, [...normalised].join(', ')).toBe(1);
    expect([...normalised][0]).toBe('example.com');
  });

  it('keeps a subdomain distinct from the apex', () => {
    // Deliberate: merging these would need a public suffix list, and guessing
    // wrong would fold two different client sites into one slot.
    expect(normaliseDomain('shop.example.com')).toBe('shop.example.com');
    expect(normaliseDomain('example.com')).toBe('example.com');
  });

  it('strips a trailing dot and lowercases', () => {
    expect(normaliseDomain('EXAMPLE.COM.')).toBe('example.com');
  });

  it('returns null for input that is not a usable URL', () => {
    expect(normaliseDomain('')).toBeNull();
    expect(normaliseDomain('not a url')).toBeNull();
    expect(normaliseDomain('file:///etc/passwd')).toBeNull();
  });
});

describe('claimDomain', () => {
  const KEY = 'hash-agency';

  function store() {
    return new MemoryStore();
  }

  it('claims a free slot for a new domain', async () => {
    const db = store();
    expect(await db.claimDomain(KEY, 'one.com', LIMIT)).toBe('claimed');
    expect((await db.listDomains(KEY)).map((s) => s.domain)).toEqual(['one.com']);
  });

  it('re-auditing a registered domain never consumes a second slot', async () => {
    const db = store();
    await db.claimDomain(KEY, 'one.com', LIMIT);

    for (let i = 0; i < 10; i += 1) {
      expect(await db.claimDomain(KEY, 'one.com', LIMIT)).toBe('existing');
    }

    expect(await db.listDomains(KEY)).toHaveLength(1);
  });

  it('refuses a fourth domain but still allows the first three', async () => {
    const db = store();
    for (const domain of ['one.com', 'two.com', 'three.com']) {
      expect(await db.claimDomain(KEY, domain, LIMIT)).toBe('claimed');
    }

    expect(await db.claimDomain(KEY, 'four.com', LIMIT)).toBe('limit-reached');
    expect(await db.listDomains(KEY)).toHaveLength(LIMIT);

    // The refusal must not have locked them out of what they already own.
    expect(await db.claimDomain(KEY, 'two.com', LIMIT)).toBe('existing');
  });

  it('updates last_scanned_at on every successful claim', async () => {
    const db = store();
    await db.claimDomain(KEY, 'one.com', LIMIT);
    const first = (await db.listDomains(KEY))[0]?.lastScannedAt;
    expect(first).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 5));
    await db.claimDomain(KEY, 'one.com', LIMIT);
    const second = (await db.listDomains(KEY))[0]?.lastScannedAt;

    expect(second).not.toBeNull();
    expect(second! >= first!).toBe(true);
  });

  it('keeps slots separate per license', async () => {
    const db = store();
    await db.claimDomain('hash-a', 'shared.com', LIMIT);
    await db.claimDomain('hash-b', 'shared.com', LIMIT);

    expect(await db.listDomains('hash-a')).toHaveLength(1);
    expect(await db.listDomains('hash-b')).toHaveLength(1);
  });

  it('never hands out more slots than the plan sells, under concurrency', async () => {
    const db = store();
    await db.claimDomain(KEY, 'one.com', LIMIT);
    await db.claimDomain(KEY, 'two.com', LIMIT);

    // Two different new domains racing for the single remaining slot.
    const [a, b] = await Promise.all([
      db.claimDomain(KEY, 'three.com', LIMIT),
      db.claimDomain(KEY, 'four.com', LIMIT),
    ]);

    expect([a, b].filter((r) => r === 'claimed')).toHaveLength(1);
    expect([a, b].filter((r) => r === 'limit-reached')).toHaveLength(1);
    expect(await db.listDomains(KEY)).toHaveLength(LIMIT);
  });
});

describe('plan domain allowances', () => {
  it('gives every plan at least one domain slot', () => {
    // A plan with zero slots sells a licence that can never audit anything.
    for (const plan of PLANS) {
      expect(plan.domainSlots, plan.name).toBeGreaterThanOrEqual(1);
    }
  });

  it('never sells fewer scans than domains', () => {
    // Three domains and two scans would mean one registered site could never
    // be audited at all.
    for (const plan of PLANS) {
      expect(plan.totalScansAllowed, plan.name).toBeGreaterThanOrEqual(plan.domainSlots);
    }
  });

  it('matches the advertised Agency Pro allowance', () => {
    expect(planById('agency')?.domainSlots).toBe(15);
    expect(planById('agency')?.totalScansAllowed).toBe(50);
  });
});
