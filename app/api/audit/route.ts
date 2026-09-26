import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateLicense, fail, ok, readJson } from '@/lib/api';
import { store } from '@/lib/db';
import { FetchError, PAGE_LIMITS, runAudit } from '@/lib/audit';
import { remainingCredits, spendCredit } from '@/lib/licensing';
import { validateUrl } from '@/lib/scanner/validate-url';
import { AGENCY_DOMAIN_SLOTS, normaliseDomain } from '@/lib/domains';
import { auditReadyEmail } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Full site audit. Requires a license key and spends one credit.
 *
 * The credit is spent before the crawl starts so that two concurrent requests
 * cannot both slip through on the last credit, and refunded if the crawl fails
 * before producing a result.
 */

const schema = z.object({
  url: z.string().min(3).max(2048),
  maxPages: z.number().int().min(1).max(PAGE_LIMITS.audit).optional(),
  /** Set false to skip the completion email. */
  notify: z.boolean().optional(),
});

/**
 * Presentable copy for each failure the crawl can surface.
 *
 * FetchError messages are written for a developer reading a log. These are
 * written for a customer looking at a dialog, and every one of them says what
 * to do next. The `code` travels alongside so the frontend can branch without
 * matching on prose.
 */
const FRIENDLY_ERROR: Record<string, string> = {
  timeout:
    'That site took too long to respond. It may be slow or temporarily down — try again in a few minutes.',
  'dns-failure':
    'We could not find that domain. Check the spelling, or confirm the site is live.',
  network:
    'We could not reach that site. It may be down, or blocking automated requests.',
  'blocked-host':
    'That address is not publicly reachable, so there is nothing an AI crawler could read there.',
  'invalid-url': 'That does not look like a valid website address.',
  'too-many-redirects':
    'That site redirected too many times. Check for a redirect loop in your hosting configuration.',
  'unsupported-content':
    'That URL does not return a web page. Point us at an HTML page rather than a file download.',
};

function friendly(code: string, fallback: string): string {
  return FRIENDLY_ERROR[code] ?? fallback;
}

export async function POST(request: Request): Promise<Response> {
  const authResult = await authenticateLicense(request);
  if ('response' in authResult) return authResult.response;
  const { license, keyHash } = authResult.auth;

  const parsedBody = await readJson(request);
  if ('response' in parsedBody) return parsedBody.response;

  const parsed = schema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return fail('invalid-input', 'Provide a "url" to audit.', 400);
  }

  // Validate before spending anything. This runs ahead of the credit debit so
  // that a malformed or private-range target never touches the licence row —
  // previously such a request debited a credit and refunded it in the catch
  // block, which is two writes and a brief window where the customer's balance
  // was wrong. safeFetch re-checks every hop regardless; this is the early,
  // cheap, friendly rejection.
  const validation = await validateUrl(parsed.data.url);
  if (!validation.ok) {
    return fail(
      validation.code,
      friendly(validation.code, validation.message),
      validation.status,
    );
  }

  const db = await store();

  /*
   * Two authorisation models, decided by plan.
   *
   * Agency Pro sells a number of SITES, not a number of audits: re-auditing a
   * registered domain is free and unlimited, which is the whole proposition.
   * The one-time plans sell a number of AUDITS and burn a credit each time.
   *
   * The slot claim happens before the crawl for the same reason the credit
   * debit does — two concurrent requests must not both take the last one.
   */
  const isSlotPlan = license.plan === 'agency';
  let credit: Awaited<ReturnType<typeof spendCredit>> | null = null;

  if (isSlotPlan) {
    const domain = normaliseDomain(parsed.data.url);
    if (!domain) {
      return fail('invalid-url', friendly('invalid-url', 'Invalid URL.'), 400);
    }

    const claim = await db.claimDomain(keyHash, domain, AGENCY_DOMAIN_SLOTS);

    if (claim === 'limit-reached') {
      return NextResponse.json(
        {
          code: 'DOMAIN_LIMIT_REACHED',
          error:
            `You have used all ${AGENCY_DOMAIN_SLOTS} domain slots included in Agency Pro. ` +
            'You can re-audit your existing domains anytime, or purchase a Growth Pack ' +
            'to audit additional websites.',
          domains: await db.listDomains(keyHash),
        },
        { status: 403 },
      );
    }
  } else {
    credit = await spendCredit(keyHash);
    if (!credit.allowed) {
      return fail('no-credits', credit.reason ?? 'No audit credits remaining.', 402);
    }
  }

  try {
    const result = await runAudit({
      url: parsed.data.url,
      mode: 'audit',
      maxPages: parsed.data.maxPages,
    });

    await db.saveAudit({
      id: result.id,
      licenseKeyHash: keyHash,
      siteUrl: result.siteUrl,
      mode: 'audit',
      score: result.score,
      invisiblePercent: result.invisiblePercent,
      result,
      createdAt: result.createdAt,
    });

    if (parsed.data.notify !== false && license.email) {
      // Delivery must never fail the audit the customer paid for.
      const emailResult = await sendEmail(
        license.email,
        auditReadyEmail({ result, brandName: license.brandName }),
      );
      if (!emailResult.sent && !emailResult.skipped) {
        console.error('[audit] completion email failed', emailResult.error);
      }
    }

    return ok({
      audit: result,
      creditsRemaining: credit?.remaining ?? null,
      domains: isSlotPlan ? await db.listDomains(keyHash) : undefined,
    });
  } catch (error) {
    /*
     * Refund the credit — but only on the credit-burning plans.
     *
     * A slot plan spent nothing to refund. The slot stays claimed, which is
     * deliberate: the customer chose that domain, and a failed first crawl
     * should not quietly hand the slot back and let them register a fourth
     * site. They can re-audit it as often as they like at no cost.
     */
    if (!isSlotPlan) {
      const refunded = await db.getLicense(keyHash);
      if (refunded && refunded.auditQuota !== null && refunded.auditsUsed > 0) {
        await db.upsertLicense({ ...refunded, auditsUsed: refunded.auditsUsed - 1 });
      }
    }

    if (error instanceof FetchError) {
      const status =
        error.code === 'blocked-host' || error.code === 'invalid-url' ? 400 : 502;
      return fail(
        error.code,
        `${friendly(error.code, error.message)} Your credit was not used.`,
        status,
      );
    }

    console.error('[audit] unexpected failure', error);
    return fail(
      'audit-failed',
      'The audit could not be completed and your credit was not used. Try again shortly.',
      500,
    );
  }
}

/** Current entitlement for a license, used by the dashboard on load. */
export async function GET(request: Request): Promise<Response> {
  const authResult = await authenticateLicense(request);
  if ('response' in authResult) return authResult.response;
  const { license, keyHash } = authResult.auth;

  const db = await store();
  const [audits, domains] = await Promise.all([
    db.listAudits(keyHash, 50),
    license.plan === 'agency' ? db.listDomains(keyHash) : Promise.resolve([]),
  ]);

  return ok({
    license: {
      plan: license.plan,
      keyTail: license.keyTail,
      email: license.email,
      status: license.status,
      auditQuota: license.auditQuota,
      auditsUsed: license.auditsUsed,
      creditsRemaining: remainingCredits(license),
      brandName: license.brandName,
      brandColor: license.brandColor,
      /** Slot allowance, or null on the credit-burning plans. */
      domainLimit: license.plan === 'agency' ? AGENCY_DOMAIN_SLOTS : null,
    },
    domains,
    audits,
  });
}
