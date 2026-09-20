import { z } from 'zod';
import { authenticateLicense, fail, ok, readJson } from '@/lib/api';
import { store } from '@/lib/db';
import { FetchError, PAGE_LIMITS, runAudit } from '@/lib/audit';
import { remainingCredits, spendCredit } from '@/lib/licensing';
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

  const credit = await spendCredit(keyHash);
  if (!credit.allowed) {
    return fail('no-credits', credit.reason ?? 'No audit credits remaining.', 402);
  }

  const db = await store();

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
      creditsRemaining: credit.remaining,
    });
  } catch (error) {
    // The crawl never produced a result, so give the credit back.
    const refunded = await db.getLicense(keyHash);
    if (refunded && refunded.auditQuota !== null && refunded.auditsUsed > 0) {
      await db.upsertLicense({ ...refunded, auditsUsed: refunded.auditsUsed - 1 });
    }

    if (error instanceof FetchError) {
      const status = error.code === 'blocked-host' || error.code === 'invalid-url' ? 400 : 502;
      return fail(error.code, `${error.message} Your credit was not used.`, status);
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
  const audits = await db.listAudits(keyHash, 50);

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
    },
    audits,
  });
}
