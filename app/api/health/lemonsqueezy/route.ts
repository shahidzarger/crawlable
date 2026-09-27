import { timingSafeEqual } from 'node:crypto';
import { enforceRateLimit } from '@/lib/api';
import { env } from '@/lib/env';
import { checkLemonSqueezyConfig } from '@/lib/lemonsqueezy-config-check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read-only diagnostic: does the Lemon Squeezy configuration match what the
 * site sells?
 *
 * Reads each configured variant back from the Lemon Squeezy API and compares
 * its price, billing category and license-key setting against lib/plans.ts.
 * It exists because the alternative way to discover a stale variant ID is a
 * customer paying and receiving nothing.
 *
 * Status codes follow health-check convention rather than REST: 200 when
 * everything matches, 503 when it does not. That makes the endpoint usable as
 * an uptime check without parsing the body — the body still explains exactly
 * what is wrong.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://usecrawlable.com/api/health/lemonsqueezy
 *   https://usecrawlable.com/api/health/lemonsqueezy?key=CRON_SECRET
 */

/**
 * Constant-time secret comparison.
 *
 * A plain `===` on a secret leaks its length and, in principle, its prefix
 * through response timing. timingSafeEqual needs equal-length buffers, so the
 * length check is done first and deliberately returns the same way a wrong
 * secret does.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<Response> {
  const secret = env().CRON_SECRET;

  /*
   * Fail closed. An unauthenticated version of this endpoint would publish the
   * store's product names, prices and configuration to anyone who guessed the
   * path, so an unset secret disables it rather than opening it.
   */
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

  // Blunts guessing at the secret, and this endpoint makes several upstream
  // API calls per request — it should not be a free amplifier either.
  const limited = await enforceRateLimit(request, 'health-lemonsqueezy', 20, 3600);
  if (limited) return limited;

  const header = request.headers.get('authorization') ?? '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  // ?key= is accepted so the check can be run from a browser address bar.
  // It does land in server and proxy logs, which is why the header form is
  // documented first and CRON_SECRET should be rotatable.
  const query = new URL(request.url).searchParams.get('key') ?? '';
  const provided = bearer || query;

  if (!provided || !secretMatches(provided, secret)) {
    return Response.json({ status: 'error', error: 'Unauthorized' }, { status: 401 });
  }

  const result = await checkLemonSqueezyConfig();

  return Response.json(result, {
    status: result.status === 'ok' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
