import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@/lib/env';

/**
 * CAN-SPAM is priced per message.
 *
 * The FTC's current maximum is $53,088 per non-compliant email, and each email
 * is its own violation — so a promotional send with no postal address and no
 * working opt-out scales linearly with the size of the list. These tests exist
 * because the failure is silent: a missing environment variable produces mail
 * that looks perfectly normal and is unlawful in every copy.
 */

const ORIGINAL = { ...process.env };

function configure(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvCache();
}

beforeEach(() => {
  configure({
    NEXT_PUBLIC_SITE_URL: 'https://usecrawlable.com',
    BUSINESS_LEGAL_NAME: 'Example Trading FZ-LLC',
    BUSINESS_POSTAL_ADDRESS: 'Office 1, Example Tower, Dubai, United Arab Emirates',
    BUSINESS_REGISTRATION: '12345',
    UNSUBSCRIBE_SECRET: 'a-secret-long-enough-to-pass',
  });
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  resetEnvCache();
});

describe('unsubscribe tokens', () => {
  it('round-trips an address', async () => {
    const { unsubscribeToken, verifyUnsubscribeToken } = await import('@/lib/email/unsubscribe');
    const token = unsubscribeToken('Person@Example.com');
    expect(token).toBeTruthy();
    // Normalised on the way in, so one address cannot hold two opt-out states.
    expect(verifyUnsubscribeToken(token as string)).toBe('person@example.com');
  });

  it('rejects a tampered token, which is what stops mass opt-out of other people', async () => {
    const { unsubscribeToken, verifyUnsubscribeToken } = await import('@/lib/email/unsubscribe');
    const token = unsubscribeToken('victim@example.com') as string;
    const [payload, signature] = token.split('.');

    // Same signature, different address: the attack this guards against.
    const forgedPayload = Buffer.from('someone-else@example.com', 'utf8').toString('base64url');
    expect(verifyUnsubscribeToken(`${forgedPayload}.${signature ?? ''}`)).toBeNull();

    // Altered signature.
    expect(verifyUnsubscribeToken(`${payload ?? ''}.deadbeef`)).toBeNull();

    // Malformed input must not throw.
    expect(verifyUnsubscribeToken('')).toBeNull();
    expect(verifyUnsubscribeToken('no-separator')).toBeNull();
  });

  it('offers no token at all when the signing key is unset', async () => {
    configure({ UNSUBSCRIBE_SECRET: undefined });
    const { unsubscribeToken, unsubscribeUrl } = await import('@/lib/email/unsubscribe');
    // Null, not an unsigned fallback: a link that cannot be verified would
    // appear to work and quietly suppress nobody.
    expect(unsubscribeToken('person@example.com')).toBeNull();
    expect(unsubscribeUrl('person@example.com')).toBeNull();
  });
});

describe('commercial email gate', () => {
  it('is open when an address and a signing key are configured', async () => {
    const { canSendCommercialEmail } = await import('@/lib/legal');
    expect(canSendCommercialEmail().ok).toBe(true);
  });

  it('closes when the postal address is missing', async () => {
    configure({ BUSINESS_POSTAL_ADDRESS: undefined });
    const { canSendCommercialEmail } = await import('@/lib/legal');
    const result = canSendCommercialEmail();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('BUSINESS_POSTAL_ADDRESS');
  });

  it('closes when the unsubscribe secret is missing', async () => {
    configure({ UNSUBSCRIBE_SECRET: undefined });
    const { canSendCommercialEmail } = await import('@/lib/legal');
    expect(canSendCommercialEmail().ok).toBe(false);
  });
});

describe('email templates', () => {
  it('marks promotional mail commercial and carries an opt-out and an address', async () => {
    const { nudgeEmail, scanFollowUpEmail } = await import('@/lib/email/templates');

    const nudge = nudgeEmail({ licenseTail: '9animal', recipient: 'buyer@example.com' });
    expect(nudge.kind).toBe('commercial');
    expect(nudge.unsubscribeUrl).toContain('/api/unsubscribe?t=');
    expect(nudge.html).toContain('Unsubscribe');
    expect(nudge.html).toContain('Example Tower');
    // The text/plain part is not exempt: it is what some clients render.
    expect(nudge.text).toContain('Unsubscribe: https://');
    expect(nudge.text).toContain('Example Tower');

    const follow = scanFollowUpEmail({
      siteUrl: 'https://example.com',
      score: 41,
      invisiblePercent: 60,
      recipient: 'scanner@example.com',
    });
    expect(follow.kind).toBe('commercial');
    expect(follow.unsubscribeUrl).toBeTruthy();
    expect(follow.text).toContain('Unsubscribe: https://');
  });

  it('marks receipts transactional and offers no unsubscribe', async () => {
    const { purchaseEmail } = await import('@/lib/email/templates');
    const { PLANS } = await import('@/lib/plans');
    const plan = PLANS[0];
    if (!plan) throw new Error('No plans configured.');

    const receipt = purchaseEmail({ licenseKey: 'TEST-KEY-0000', plan });
    expect(receipt.kind).toBe('transactional');
    expect(receipt.unsubscribeUrl).toBeUndefined();
    /*
     * Deliberate: a licence key is the thing the customer paid for. An
     * unsubscribe link on it would let someone opt out of their own delivery,
     * and CAN-SPAM's opt-out right does not reach transactional mail.
     */
    expect(receipt.html).not.toContain('Unsubscribe');
    // The address still appears — it costs nothing and answers "who charged me".
    expect(receipt.html).toContain('Example Tower');
  });

  it('omits the identity block rather than printing a placeholder when unset', async () => {
    configure({ BUSINESS_LEGAL_NAME: undefined, BUSINESS_POSTAL_ADDRESS: undefined });
    const { purchaseEmail } = await import('@/lib/email/templates');
    const { PLANS } = await import('@/lib/plans');
    const plan = PLANS[0];
    if (!plan) throw new Error('No plans configured.');

    const receipt = purchaseEmail({ licenseKey: 'TEST-KEY-0000', plan });
    expect(receipt.html).not.toContain('undefined');
    expect(receipt.html).not.toContain('null');
  });
});

describe('suppression list', () => {
  it('records an opt-out, is idempotent, and is case-insensitive', async () => {
    const { MemoryStore } = await import('@/lib/db/memory');
    const db = new MemoryStore();

    expect(await db.isEmailSuppressed('person@example.com')).toBe(false);
    await db.suppressEmail('Person@Example.com', 'unsubscribe-link');
    expect(await db.isEmailSuppressed('person@example.com')).toBe(true);
    // A second click must not be an error, and must not undo anything.
    await db.suppressEmail('person@example.com', 'unsubscribe-link');
    expect(await db.isEmailSuppressed('PERSON@EXAMPLE.COM')).toBe(true);
  });
});

describe('compliance diagnostic', () => {
  it('reports ok when everything needed is configured', async () => {
    const { checkCompliance } = await import('@/lib/compliance-check');
    const report = checkCompliance();
    expect(report.status).toBe('ok');
    expect(report.commercialEmailEnabled).toBe(true);
  });

  it('names the missing variable rather than just failing', async () => {
    configure({ BUSINESS_POSTAL_ADDRESS: undefined });
    const { checkCompliance } = await import('@/lib/compliance-check');
    const report = checkCompliance();
    expect(report.status).toBe('incomplete');
    expect(report.commercialEmailEnabled).toBe(false);
    const item = report.items.find((i) => i.id === 'postal-address');
    expect(item?.ok).toBe(false);
  });
});
