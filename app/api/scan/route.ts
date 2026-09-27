import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { enforceRateLimit, fail, ok, readJson } from '@/lib/api';
import { store } from '@/lib/db';
import { FetchError, PAGE_LIMITS, redactForFreeScan, runAudit } from '@/lib/audit';
import { betaFreeDeepAudit, freeAuditRateLimit } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The free, unauthenticated audit. One page normally; up to the full 40-page
 * ceiling while NEXT_PUBLIC_BETA_FREE_DEEP_AUDIT is on.
 *
 * The beta widens the DIAGNOSTIC, never the deliverable. Three things keep
 * the paid boundary intact whatever the flag says:
 *
 *   1. The response is redacted, so `generated` never reaches the client.
 *   2. The stored record has `generated` removed before it is written, so the
 *      Fix Kit is not merely hidden — for an anonymous run it does not exist.
 *      A bug in a download guard therefore cannot leak one.
 *   3. The record is saved with no owning licence, and the download route
 *      refuses a report no licence owns.
 *
 * The beta path deliberately does NOT go through /api/audit. That route
 * spends scans, binds domains and refunds on failure, and making a licence
 * optional there would run free traffic through the most consequential code
 * in the app to no benefit.
 */

const schema = z.object({
  url: z.string().min(3).max(2048),
});

export async function POST(request: Request): Promise<Response> {
  const deep = betaFreeDeepAudit();
  const { limit, windowSeconds } = freeAuditRateLimit();

  /*
   * Separate buckets per mode, so flipping the flag cannot let a caller carry
   * a single-page allowance over into deep crawls or vice versa.
   */
  const limited = await enforceRateLimit(
    request,
    deep ? 'scan-deep' : 'scan',
    limit,
    windowSeconds,
  );
  if (limited) return limited;

  const parsedBody = await readJson(request);
  if ('response' in parsedBody) return parsedBody.response;

  const parsed = schema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return fail('invalid-input', 'Provide a "url" to scan.', 400);
  }

  try {
    const result = await runAudit({
      url: parsed.data.url,
      mode: deep ? 'audit' : 'scan',
      // Explicit rather than implied: the cap is the same 40 a paid audit
      // uses, and runAudit clamps to PAGE_LIMITS regardless.
      ...(deep ? { maxPages: PAGE_LIMITS.audit } : {}),
    });

    /*
     * Strip the Fix Kit before storing, not just before responding.
     *
     * runAudit generates the files whenever mode is 'audit'. For an anonymous
     * run nobody is entitled to them, so they are dropped here and the record
     * keeps only the diagnostic. A licence that later asks for this report's
     * kit is refused by the download route for want of ownership; a licence
     * that owns a report gets the kit regenerated from the stored crawl.
     */
    const { generated: _unentitled, ...diagnosticOnly } = result;

    const db = await store();
    await db.saveAudit({
      id: result.id,
      licenseKeyHash: null,
      siteUrl: result.siteUrl,
      // The real mode, so the report page shows the full multi-page metrics.
      mode: deep ? 'audit' : 'scan',
      score: result.score,
      invisiblePercent: result.invisiblePercent,
      result: diagnosticOnly as typeof result,
      createdAt: result.createdAt,
    });

    return ok({ scan: redactForFreeScan(result), deep });
  } catch (error) {
    if (error instanceof FetchError) {
      const status =
        error.code === 'bot-opted-out'
          ? 403
          : error.code === 'blocked-host' || error.code === 'invalid-url'
            ? 400
            : 502;
      return fail(error.code, error.message, status);
    }

    // Log the detail server-side; return something a visitor can act on.
    console.error('[scan] unexpected failure', {
      id: randomUUID(),
      message: error instanceof Error ? error.message : String(error),
    });
    return fail('scan-failed', 'The scan could not be completed. Try again shortly.', 500);
  }
}
