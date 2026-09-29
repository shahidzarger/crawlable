import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '@/lib/env';

/**
 * Server-created checkouts.
 *
 * Every purchase is a checkout created per click and opened as a full page.
 * These pin exactly what is sent to Lemon Squeezy, because the options are the
 * whole point of creating checkouts server-side rather than linking to them.
 */

describe('return URLs', () => {
  it('points the post-purchase redirect at production', async () => {
    const { postPurchaseUrl, POST_PURCHASE_PATH } = await import('@/lib/checkout-links');
    expect(postPurchaseUrl()).toBe('https://usecrawlable.com/dashboard?purchase=success');
    expect(POST_PURCHASE_PATH).toBe('/dashboard?purchase=success');
  });
});

describe('createCheckout payload', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('LEMONSQUEEZY_API_KEY', 'k');
    vi.stubEnv('LEMONSQUEEZY_STORE_ID', '1');
    vi.stubEnv('LEMONSQUEEZY_WEBHOOK_SECRET', 'w');
    vi.stubEnv('LEMONSQUEEZY_VARIANT_SINGLE', '11');
    vi.stubEnv('LEMONSQUEEZY_VARIANT_PACK', '22');
    vi.stubEnv('LEMONSQUEEZY_VARIANT_AGENCY', '33');
    resetEnvCache();
    // A fresh Response per call: a body can only be read once.
    fetchMock.mockReset().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: { id: 'c1', attributes: { url: 'https://checkout.usecrawlable.com/checkout/custom/c1' } },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  async function payloadFor(planIndex: number) {
    const { createCheckout } = await import('@/lib/lemonsqueezy');
    const { PLANS } = await import('@/lib/plans');
    await createCheckout({ plan: PLANS[planIndex]!, metadata: { plan: PLANS[planIndex]!.id } });
    return JSON.parse(fetchMock.mock.calls.at(-1)?.[1]?.body as string).data as {
      attributes: {
        checkout_options: Record<string, unknown>;
        product_options: Record<string, unknown>;
        checkout_data: { custom: Record<string, string> };
      };
      relationships: { store: { data: { id: string } }; variant: { data: { id: string } } };
    };
  }

  it('creates a full-page checkout with media and logo shown', async () => {
    const { checkout_options } = (await payloadFor(0)).attributes;
    expect(checkout_options).toEqual({ embed: false, media: true, logo: true });
  });

  it('sends no cancel_url — Lemon Squeezy has no such option', async () => {
    // An undocumented attribute is at best ignored and at worst a validation
    // error that fails every checkout. Pinned so it is not "helpfully" added.
    const { checkout_options, product_options } = (await payloadFor(0)).attributes;
    expect(checkout_options).not.toHaveProperty('cancel_url');
    expect(product_options).not.toHaveProperty('cancel_url');
  });

  it('sends every post-purchase exit back to usecrawlable.com', async () => {
    const { product_options } = (await payloadFor(0)).attributes;
    expect(product_options.redirect_url).toBe('https://usecrawlable.com/dashboard?purchase=success');
    expect(product_options.receipt_link_url).toBe('https://usecrawlable.com/dashboard');
    expect(product_options.receipt_button_text).toBe('Go to Dashboard');
  });

  it.each([
    [0, 'single', '11'],
    [1, 'pack', '22'],
    [2, 'agency', '33'],
  ])('uses the store and the right variant for plan #%i (%s)', async (index, planId, variantId) => {
    const data = await payloadFor(index);
    expect(data.relationships.store.data.id).toBe('1');
    expect(data.relationships.variant.data.id).toBe(variantId);
    // The webhook provisions from this field alone.
    expect(data.attributes.checkout_data.custom.plan).toBe(planId);
  });
});
