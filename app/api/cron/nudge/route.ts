import { env } from '@/lib/env';
import { store } from '@/lib/db';
import { nudgeEmail } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Day-2 onboarding nudge.
 *
 * Finds licenses bought at least 48 hours ago that have never been used, sends
 * one reminder, and marks them so nobody is emailed twice. Scheduled daily by
 * the cron entry in vercel.json.
 *
 * Protected by CRON_SECRET. When that is unset the endpoint refuses to run
 * rather than defaulting open, because an unauthenticated endpoint that sends
 * email is a spam cannon.
 */

const MIN_AGE_HOURS = 48;
const BATCH_SIZE = 100;

export async function GET(request: Request): Promise<Response> {
  const secret = env().CRON_SECRET;

  if (!secret) {
    return Response.json(
      { error: 'CRON_SECRET is not configured; refusing to run.' },
      { status: 503 },
    );
  }

  const authorization = request.headers.get('authorization') ?? '';
  if (authorization !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = await store();
  const candidates = await db.listLicensesToNudge(MIN_AGE_HOURS, BATCH_SIZE);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const license of candidates) {
    if (!license.email) {
      // Mark it anyway so an unmailable record is not reconsidered daily.
      await db.markNudged(license.keyHash);
      skipped += 1;
      continue;
    }

    const result = await sendEmail(license.email, nudgeEmail({ licenseTail: license.keyTail }));

    if (result.sent) {
      await db.markNudged(license.keyHash);
      sent += 1;
    } else if (result.skipped) {
      skipped += 1;
    } else {
      // Leave nudged_at null so a transient failure is retried tomorrow.
      console.error('[cron/nudge] send failed', { keyTail: license.keyTail, error: result.error });
      failed += 1;
    }
  }

  return Response.json({
    considered: candidates.length,
    sent,
    skipped,
    failed,
    timestamp: new Date().toISOString(),
  });
}
