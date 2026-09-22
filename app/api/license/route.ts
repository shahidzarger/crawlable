import { authenticateLicense, enforceRateLimit, ok } from '@/lib/api';
import { remainingCredits } from '@/lib/licensing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Validate a license key and report its entitlement.
 *
 * The white-label branding mutation that used to live here was removed with
 * the feature. The `brandName` / `brandColor` columns are left in place rather
 * than migrated away: dropping populated columns is irreversible, and they
 * cost nothing while unused.
 */

export async function POST(request: Request): Promise<Response> {
  const limited = await enforceRateLimit(request, 'license', 30, 3600);
  if (limited) return limited;

  const authResult = await authenticateLicense(request);
  if ('response' in authResult) return authResult.response;
  const { license } = authResult.auth;

  return ok({
    valid: true,
    license: {
      plan: license.plan,
      keyTail: license.keyTail,
      status: license.status,
      auditQuota: license.auditQuota,
      auditsUsed: license.auditsUsed,
      creditsRemaining: remainingCredits(license),
      brandName: license.brandName,
      brandColor: license.brandColor,
    },
  });
}
