import { store, storeKind } from '@/lib/db';
import { isLemonSqueezyConfigured, env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Health check.
 *
 * Point an uptime monitor at this. It returns 200 only when the store is
 * reachable, and reports the configuration facts that silently break a
 * deployment: an in-memory store in production, or payments not wired up.
 */
export async function GET(): Promise<Response> {
  const started = Date.now();
  const kind = storeKind();

  let storeHealthy = false;
  let storeError: string | null = null;

  try {
    const db = await store();
    storeHealthy = await db.healthy();
  } catch (error) {
    storeError = error instanceof Error ? error.message : 'Store unavailable.';
  }

  const production = env().NODE_ENV === 'production';
  const warnings: string[] = [];

  if (production && kind === 'memory') {
    warnings.push(
      'DATABASE_URL is not set. Licenses and audits are held in memory and will be lost on the next cold start.',
    );
  }
  if (!isLemonSqueezyConfigured()) {
    warnings.push('Lemon Squeezy is not fully configured. Checkout and webhooks are disabled.');
  }
  if (!env().RESEND_API_KEY) {
    warnings.push('RESEND_API_KEY is not set. Transactional email is disabled.');
  }

  const healthy = storeHealthy;

  return Response.json(
    {
      status: healthy ? 'ok' : 'degraded',
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      checks: {
        store: { kind, healthy: storeHealthy, error: storeError },
        payments: { configured: isLemonSqueezyConfigured() },
        email: { configured: Boolean(env().RESEND_API_KEY) },
      },
      warnings,
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
