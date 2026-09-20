import { z } from 'zod';
import { enforceRateLimit, fail, ok, readJson } from '@/lib/api';
import { createCheckout } from '@/lib/lemonsqueezy';
import { isLemonSqueezyConfigured } from '@/lib/env';
import { planById, isPlanId } from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Create a Lemon Squeezy hosted checkout and hand back the redirect URL. */

const schema = z.object({
  plan: z.string().refine(isPlanId, 'Unknown plan.'),
  email: z.string().email().optional(),
  /** Optional audit ID from a free scan, so the purchase can be attributed. */
  scanId: z.string().uuid().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const limited = await enforceRateLimit(request, 'checkout', 20, 3600);
  if (limited) return limited;

  if (!isLemonSqueezyConfigured()) {
    return fail(
      'payments-unconfigured',
      'Checkout is not available yet — the store is still being connected.',
      503,
    );
  }

  const parsedBody = await readJson(request);
  if ('response' in parsedBody) return parsedBody.response;

  const parsed = schema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return fail('invalid-input', parsed.error.issues[0]?.message ?? 'Invalid request.', 400);
  }

  const plan = planById(parsed.data.plan);
  if (!plan) return fail('unknown-plan', 'Unknown plan.', 400);

  try {
    const checkout = await createCheckout({
      plan,
      email: parsed.data.email,
      metadata: {
        plan: plan.id,
        ...(parsed.data.scanId ? { scan_id: parsed.data.scanId } : {}),
      },
    });

    return ok({ url: checkout.url, checkoutId: checkout.checkoutId });
  } catch (error) {
    console.error('[checkout] failed', error);
    return fail(
      'checkout-failed',
      'Could not start checkout. Try again, or email support if it persists.',
      502,
    );
  }
}
