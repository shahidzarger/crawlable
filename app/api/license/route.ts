import { z } from 'zod';
import { authenticateLicense, enforceRateLimit, fail, ok, readJson } from '@/lib/api';
import { store } from '@/lib/db';
import { remainingCredits } from '@/lib/licensing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Validate a license key and, for agency plans, update white-label branding. */

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

const brandingSchema = z.object({
  brandName: z.string().max(60).nullable(),
  brandColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, 'Use a six-digit hex colour, such as #3ddc97.')
    .nullable(),
});

export async function PATCH(request: Request): Promise<Response> {
  const authResult = await authenticateLicense(request);
  if ('response' in authResult) return authResult.response;
  const { license, keyHash } = authResult.auth;

  if (license.plan !== 'agency') {
    return fail(
      'plan-required',
      'White-label branding is part of the Agency plan.',
      403,
    );
  }

  const parsedBody = await readJson(request);
  if ('response' in parsedBody) return parsedBody.response;

  const parsed = brandingSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return fail('invalid-input', parsed.error.issues[0]?.message ?? 'Invalid branding.', 400);
  }

  const db = await store();
  await db.updateLicenseBranding(keyHash, parsed.data.brandName, parsed.data.brandColor);

  return ok({ updated: true, ...parsed.data });
}
