import { timingSafeEqual } from 'node:crypto';
import { enforceRateLimit } from '@/lib/api';
import { env } from '@/lib/env';
import { checkCompliance } from '@/lib/compliance-check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read-only diagnostic: is the configuration that keeps our email lawful
 * actually present in this environment?
 *
 * Exists because the alternative way to find out that BUSINESS_POSTAL_ADDRESS
 * was never set in Vercel is a promotional send going out without it — and
 * under CAN-SPAM that is priced per message, not per incident.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://usecrawlable.com/api/health/compliance
 *   https://usecrawlable.com/api/health/compliance?key=CRON_SECRET
 */

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<Response> {
  const secret = env().CRON_SECRET;

  // Fail closed, as with the Lemon Squeezy check: this reports on which
  // secrets are configured, which is not something to publish.
  if (!secret) {
    return Response.json(
      {
        status: 'error',
        error:
          'CRON_SECRET is not configured, so this diagnostic is disabled. Set it to enable the check.',
      },
      { status: 503 },
    );
  }

  const limited = await enforceRateLimit(request, 'health-compliance', 20, 3600);
  if (limited) return limited;

  const header = request.headers.get('authorization') ?? '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const query = new URL(request.url).searchParams.get('key') ?? '';
  const provided = bearer || query;

  if (!provided || !secretMatches(provided, secret)) {
    return Response.json({ status: 'error', error: 'Unauthorized' }, { status: 401 });
  }

  const result = checkCompliance();

  return Response.json(result, {
    status: result.status === 'ok' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
