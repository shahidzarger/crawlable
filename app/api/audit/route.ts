import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateLicense, fail, ok, readJson } from '@/lib/api';
import { store } from '@/lib/db';
import { FetchError, PAGE_LIMITS, runAudit } from '@/lib/audit';
import {
  authoriseDomain,
  domainSlotsForPlan,
  isWindowClosed,
  remainingScans,
  spendScan,
} from '@/lib/licensing';
import { validateUrl } from '@/lib/scanner/validate-url';
import { normaliseDomain } from '@/lib/domains';
import { auditReadyEmail } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Full site audit. Requires a license key and spends one scan.
 *
 * Every plan now meters the same way — a finite number of scans, spread over a
 * finite number of domains, inside a window — so there is one path rather than
 * the two the Agency subscription used to need.
 *
 * The scan is spent before the crawl starts so that two concurrent requests
 * cannot both slip through on the last one, and refunded if the crawl fails
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

  const domain = normaliseDomain(parsed.data.url);
  if (!domain) {
    return fail('invalid-url', friendly('invalid-url', 'Invalid URL.'), 400);
  }

  /*
   * Spend first, authorise second, refund on refusal.
   *
   * The other order looks more natural and is wrong: claiming a domain slot is
   * a permanent commitment, so authorising first would let a customer who has
   * run out of scans burn a slot on a site they are then told they cannot
   * scan. Spending first risks nothing by comparison, because the scan is
   * refundable and the refund path already exists for failed crawls.
   */
  const scan = await spendScan(keyHash);
  if (!scan.allowed) {
    return NextResponse.json(
      {
        code: isWindowClosed(license) ? 'WINDOW_CLOSED' : 'NO_SCANS_REMAINING',
        error: scan.reason ?? 'No verification scans remaining.',
        scansRemaining: scan.remaining ?? 0,
        expiresAt: license.expiresAt,
      },
      { status: 402 },
    );
  }

  const authorised = await authoriseDomain(license, domain);
  if (!authorised.allowed) {
    await refundScan(keyHash);
    return NextResponse.json(
      {
        code: authorised.code === 'slots-full' ? 'DOMAIN_LIMIT_REACHED' : 'DOMAIN_LOCKED',
        error: authorised.reason,
        domains: await db.listDomains(keyHash),
        domainLimit: domainSlotsForPlan(license.plan),
      },
      { status: 403 },
    );
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
      scansRemaining: scan.remaining ?? 0,
      domains: await db.listDomains(keyHash),
    });
  } catch (error) {
    /*
     * Refund the scan. The domain slot, if one was claimed, stays claimed —
     * the customer chose that site, and a failed first crawl should not
     * quietly hand the slot back and let them register an extra one. Re-scans
     * of a registered domain cost a scan but never a slot.
     */
    await refundScan(keyHash);

    if (error instanceof FetchError) {
      const status =
        error.code === 'blocked-host' || error.code === 'invalid-url' ? 400 : 502;
      return fail(
        error.code,
        `${friendly(error.code, error.message)} Your scan was not used.`,
        status,
      );
    }

    console.error('[audit] unexpected failure', error);
    return fail(
      'audit-failed',
      'The audit could not be completed and your scan was not used. Try again shortly.',
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
    db.listDomains(keyHash),
  ]);

  return ok({
    license: {
      plan: license.plan,
      keyTail: license.keyTail,
      email: license.email,
      status: license.status,
      targetDomain: license.targetDomain,
      totalScansAllowed: license.totalScansAllowed,
      scansUsed: license.scansUsed,
      scansRemaining: remainingScans(license),
      expiresAt: license.expiresAt,
      windowClosed: isWindowClosed(license),
      brandName: license.brandName,
      brandColor: license.brandColor,
      domainLimit: domainSlotsForPlan(license.plan),
    },
    domains,
    audits,
  });
}

/**
 * Hand a scan back.
 *
 * Read-modify-write rather than a conditional decrement, because the store
 * interface has no decrement and adding one would mean adding a way to give
 * scans back — a capability worth keeping narrow. The race window is real but
 * benign: the worst outcome is a customer keeping a scan they should have
 * spent, which is the direction to err in.
 */
async function refundScan(keyHash: string): Promise<void> {
  const db = await store();
  const record = await db.getLicense(keyHash);
  if (record && record.scansUsed > 0) {
    await db.upsertLicense({ ...record, scansUsed: record.scansUsed - 1 });
  }
}
