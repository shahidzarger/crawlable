import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { enforceRateLimit, fail, ok, readJson } from '@/lib/api';
import { store } from '@/lib/db';
import { FetchError, redactForFreeScan, runAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Free single-page scan.
 *
 * No auth, rate limited by IP. This is the top of the funnel: it returns the
 * headline number and the real findings, but not the generated fix files.
 */

const schema = z.object({
  url: z.string().min(3).max(2048),
});

/** Free scans per IP per hour. */
const RATE_LIMIT = 8;
const WINDOW_SECONDS = 3600;

export async function POST(request: Request): Promise<Response> {
  const limited = await enforceRateLimit(request, 'scan', RATE_LIMIT, WINDOW_SECONDS);
  if (limited) return limited;

  const parsedBody = await readJson(request);
  if ('response' in parsedBody) return parsedBody.response;

  const parsed = schema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return fail('invalid-input', 'Provide a "url" to scan.', 400);
  }

  try {
    const result = await runAudit({ url: parsed.data.url, mode: 'scan' });

    const db = await store();
    await db.saveAudit({
      id: result.id,
      licenseKeyHash: null,
      siteUrl: result.siteUrl,
      mode: 'scan',
      score: result.score,
      invisiblePercent: result.invisiblePercent,
      result,
      createdAt: result.createdAt,
    });

    return ok({ scan: redactForFreeScan(result) });
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
