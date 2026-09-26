import { lemonSqueezyConfig } from '@/lib/env';
import { store } from '@/lib/db';
import {
  hashLicenseKey,
  parseWebhookEvent,
  planIdForVariant,
  verifyWebhookSignature,
} from '@/lib/lemonsqueezy';
import { recordLicense } from '@/lib/licensing';
import { planById } from '@/lib/plans';
import { purchaseEmail } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';
import type { PlanId } from '@/lib/db/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lemon Squeezy webhook receiver.
 *
 * Order of operations matters here:
 *   1. Read the raw body as text — the signature is over exact bytes, so it
 *      must not be parsed first.
 *   2. Verify the HMAC in constant time. An unverified body is discarded.
 *   3. Only then act on it.
 *
 * Handlers are idempotent because Lemon Squeezy retries on any non-2xx, and a
 * redelivered order must not reset a customer's used credits or re-send a key.
 *
 * Configure in Lemon Squeezy → Settings → Webhooks:
 *   URL:    https://your-domain.com/api/webhooks/lemonsqueezy
 *   Events: order_created, subscription_created, subscription_updated,
 *           subscription_cancelled, subscription_expired, license_key_created
 */

interface OrderAttributes {
  user_email?: string;
  status?: string;
  first_order_item?: { variant_id?: number | string; product_name?: string };
}

interface LicenseKeyAttributes {
  key?: string;
  status?: string;
  order_id?: number | string;
  user_email?: string;
  product_id?: number | string;
}

interface SubscriptionAttributes {
  user_email?: string;
  status?: string;
  order_id?: number | string;
  variant_id?: number | string;
}

function resolvePlan(
  variantId: string | number | undefined,
  productName: string | undefined,
  customPlan: string | undefined,
): PlanId | null {
  if (customPlan && planById(customPlan)) return customPlan as PlanId;

  if (variantId !== undefined) {
    try {
      const mapped = planIdForVariant(String(variantId));
      if (mapped) return mapped;
    } catch {
      // Variant IDs not configured; fall through to name matching.
    }
  }

  if (productName) {
    const lower = productName.toLowerCase();
    if (lower.includes('agency pack') || lower.includes('pack')) return 'pack';
    if (lower.includes('agency')) return 'agency';
    if (lower.includes('single')) return 'single';
  }

  return null;
}

export async function POST(request: Request): Promise<Response> {
  let secret: string;
  try {
    secret = lemonSqueezyConfig().webhookSecret;
  } catch {
    console.error('[webhook] Lemon Squeezy is not configured; rejecting delivery.');
    return new Response('Webhook not configured', { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-signature');

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    // 401 so Lemon Squeezy surfaces it, rather than retrying forever.
    return new Response('Invalid signature', { status: 401 });
  }

  const event = parseWebhookEvent(rawBody);
  if (!event) return new Response('Malformed payload', { status: 400 });

  const eventName = event.meta.event_name;
  const custom = event.meta.custom_data ?? {};

  try {
    switch (eventName) {
      case 'license_key_created': {
        const attributes = event.data.attributes as LicenseKeyAttributes;
        const key = attributes.key;
        if (!key) {
          console.error('[webhook] license_key_created without a key');
          return new Response('OK', { status: 200 });
        }

        const db = await store();
        const existing = await db.getLicense(hashLicenseKey(key));
        if (existing) {
          // Redelivery. Nothing to do, and crucially no second email.
          return new Response('OK', { status: 200 });
        }

        /*
         * `custom_data.plan` is load-bearing.
         *
         * This payload carries no variant_id, so it is the only signal that
         * identifies the plan. Both purchase paths must set it: the API route
         * sends it as checkout metadata, and the direct links in
         * lib/checkout-links.ts append `checkout[custom][plan]`. A bare Lemon
         * Squeezy buy link does not, and a purchase through one lands here
         * unresolvable — which is why raw buy links must never be published.
         */
        /*
         * Plan resolution, in order of reliability.
         *
         * 1. checkout metadata, when the purchase came through our own
         *    checkout or one of the direct links in lib/checkout-links.ts;
         * 2. the order_plans row written by order_created, which resolved the
         *    plan from the VARIANT ID — the one signal Lemon Squeezy always
         *    sends and nobody can mistype.
         *
         * The second is what makes a purchase through a bare buy link
         * recoverable instead of orphaned.
         */
        const orderId = String(attributes.order_id ?? event.data.id);
        const plan =
          resolvePlan(undefined, undefined, custom.plan) ??
          (await db.getOrderPlan(orderId));

        if (!plan) {
          // Logged at error with the key tail and order so the licence can be
          // provisioned by hand. Returning 200 stops Lemon Squeezy retrying a
          // delivery that will never succeed — the payload will not improve.
          console.error(
            '[webhook] ORPHANED PURCHASE — license_key_created with no resolvable plan. ' +
              'Provision this customer manually.',
            {
              orderId: attributes.order_id,
              email: attributes.user_email,
              keyTail: key.slice(-4),
              customData: custom,
            },
          );
          return new Response('OK', { status: 200 });
        }

        const email = attributes.user_email ?? '';
        await recordLicense({
          licenseKey: key,
          plan,
          email,
          orderId,
          status: 'active',
        });

        const planRecord = planById(plan);
        if (email && planRecord) {
          const sendResult = await sendEmail(email, purchaseEmail({ licenseKey: key, plan: planRecord }));
          if (!sendResult.sent && !sendResult.skipped) {
            console.error('[webhook] purchase email failed', sendResult.error);
          }
        }

        return new Response('OK', { status: 200 });
      }

      case 'order_created': {
        /*
         * This is where the variant ID becomes a quota.
         *
         * Orders arrive before or after license_key_created depending on store
         * configuration, and only this event carries first_order_item.
         * variant_id. Resolving the plan here and writing it against the order
         * means the key handler can always find it, whichever order the two
         * events turn up in.
         *
         * The variant IDs themselves come from the existing
         * LEMONSQUEEZY_VARIANT_SINGLE / _PACK / _AGENCY configuration. The
         * quotas attached to each plan come from lib/plans.ts, never from this
         * payload — a forged or replayed order therefore cannot grant more
         * scans than the plan sells.
         */
        const attributes = event.data.attributes as OrderAttributes;
        const plan = resolvePlan(
          attributes.first_order_item?.variant_id,
          attributes.first_order_item?.product_name,
          custom.plan,
        );

        const orderId = String(event.data.id);

        if (plan) {
          const db = await store();
          await db.recordOrderPlan(orderId, plan);
        } else {
          console.error(
            '[webhook] order_created with no resolvable plan. Check that ' +
              'LEMONSQUEEZY_VARIANT_SINGLE / _PACK / _AGENCY match this store.',
            {
              orderId,
              variantId: attributes.first_order_item?.variant_id,
              productName: attributes.first_order_item?.product_name,
            },
          );
        }

        const granted = plan ? planById(plan) : undefined;
        console.info('[webhook] order_created', {
          orderId,
          plan,
          scansGranted: granted?.totalScansAllowed,
          domainSlots: granted?.domainSlots,
          status: attributes.status,
        });

        return new Response('OK', { status: 200 });
      }

      case 'subscription_created':
      case 'subscription_updated': {
        const attributes = event.data.attributes as SubscriptionAttributes;
        const db = await store();
        const existing = await db.getLicenseByOrder(String(attributes.order_id ?? ''));

        if (existing) {
          const active = attributes.status === 'active' || attributes.status === 'on_trial';
          await db.updateLicenseStatus(existing.keyHash, active ? 'active' : 'cancelled');
        }

        return new Response('OK', { status: 200 });
      }

      case 'subscription_cancelled':
      case 'subscription_expired': {
        const attributes = event.data.attributes as SubscriptionAttributes;
        const db = await store();
        const existing = await db.getLicenseByOrder(String(attributes.order_id ?? ''));

        if (existing) {
          await db.updateLicenseStatus(
            existing.keyHash,
            eventName === 'subscription_expired' ? 'expired' : 'cancelled',
          );
        }

        return new Response('OK', { status: 200 });
      }

      default: {
        // Unhandled events are acknowledged so Lemon Squeezy stops retrying.
        console.info('[webhook] unhandled event', eventName);
        return new Response('OK', { status: 200 });
      }
    }
  } catch (error) {
    console.error('[webhook] handler failed', { eventName, error });
    // 500 asks Lemon Squeezy to retry, which is what we want for a transient
    // database failure.
    return new Response('Handler error', { status: 500 });
  }
}
