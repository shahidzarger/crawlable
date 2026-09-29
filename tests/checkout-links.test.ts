import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '@/lib/env';

/**
 * Checkout URL rules.
 *
 * Two ways customers were being stranded, both visible in the URL:
 *   - `embed=0` was set on every direct link, forcing a full-page navigation
 *     to the checkout domain even when the overlay was available.
 *   - the store logo was shown, and it links to the Lemon Squeezy storefront.
 * Plus a quiet third: the host check accepted only *.lemonsqueezy.com, so a
 * buy link on checkout.usecrawlable.com was rejected outright.
 */

async function loadWith(links: Partial<Record<'SINGLE' | 'PACK' | 'AGENCY', string>>) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_LS_BUY_SINGLE', links.SINGLE ?? '');
  vi.stubEnv('NEXT_PUBLIC_LS_BUY_PACK', links.PACK ?? '');
  vi.stubEnv('NEXT_PUBLIC_LS_BUY_AGENCY', links.AGENCY ?? '');
  return import('@/lib/checkout-links');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('directCheckoutUrl — the anchor href, used when the overlay cannot open', () => {
  it('carries the plan for the webhook and hides the logo', async () => {
    const { directCheckoutUrl } = await loadWith({ SINGLE: 'https://crawlable.lemonsqueezy.com/buy/abc' });
    const url = new URL(directCheckoutUrl('single') as string);
    expect(url.searchParams.get('checkout[custom][plan]')).toBe('single');
    expect(url.searchParams.get('logo')).toBe('0');
  });

  it('never sets embed — not 0 (forces a redirect), not 1 (dead close button)', async () => {
    const { directCheckoutUrl } = await loadWith({ SINGLE: 'https://crawlable.lemonsqueezy.com/buy/abc' });
    expect(new URL(directCheckoutUrl('single') as string).searchParams.has('embed')).toBe(false);
  });

  it('strips an embed parameter pasted into the environment variable', async () => {
    const { directCheckoutUrl } = await loadWith({
      SINGLE: 'https://crawlable.lemonsqueezy.com/buy/abc?embed=0&media=0',
    });
    const url = new URL(directCheckoutUrl('single') as string);
    expect(url.searchParams.has('embed')).toBe(false);
    // Anything else the store owner chose is kept.
    expect(url.searchParams.get('media')).toBe('0');
  });

  it('accepts the custom checkout domain', async () => {
    const { directCheckoutUrl } = await loadWith({ PACK: 'https://checkout.usecrawlable.com/buy/uuid-1' });
    expect(directCheckoutUrl('pack')).toMatch(/^https:\/\/checkout\.usecrawlable\.com\/buy\/uuid-1\?/);
  });

  it('returns null for an unset plan, so that plan falls back to the API route', async () => {
    const { directCheckoutUrl } = await loadWith({});
    expect(directCheckoutUrl('agency')).toBeNull();
  });
});

describe('isUsableLink — where a customer may be sent to enter card details', () => {
  const accept = [
    'https://crawlable.lemonsqueezy.com/buy/x',
    'https://lemonsqueezy.com/buy/x',
    'https://checkout.usecrawlable.com/buy/x',
    'https://CHECKOUT.usecrawlable.com/buy/x',
  ];
  const reject = [
    'http://checkout.usecrawlable.com/buy/x', // not HTTPS
    'https://evil.example/buy/x',
    'https://evillemonsqueezy.com/buy/x', // suffix without the dot
    'https://checkout.usecrawlable.com.evil.example/buy/x', // lookalike
    'https://usecrawlable.com/buy/x', // the main site is not the checkout
    'not a url',
    '',
  ];

  it.each(accept)('accepts %s', async (link) => {
    const { isUsableLink } = await loadWith({});
    expect(isUsableLink(link)).toBe(true);
  });

  it.each(reject)('rejects %s', async (link) => {
    const { isUsableLink } = await loadWith({});
    expect(isUsableLink(link)).toBe(false);
  });
});

describe('overlayCheckoutUrl — what goes into the Lemon.js iframe', () => {
  it('adds embed=1 and logo=0, keeping everything else intact', async () => {
    const { overlayCheckoutUrl } = await loadWith({});
    const url = new URL(
      overlayCheckoutUrl(
        'https://checkout.usecrawlable.com/checkout/custom/abc?signature=s1g&checkout%5Bcustom%5D%5Bplan%5D=pack',
      ),
    );
    expect(url.searchParams.get('embed')).toBe('1');
    expect(url.searchParams.get('logo')).toBe('0');
    // An API checkout is signed; losing the signature would break it.
    expect(url.searchParams.get('signature')).toBe('s1g');
    expect(url.searchParams.get('checkout[custom][plan]')).toBe('pack');
  });

  it('overrides embed=0 rather than leaving the overlay in page layout', async () => {
    const { overlayCheckoutUrl } = await loadWith({});
    expect(new URL(overlayCheckoutUrl('https://x.lemonsqueezy.com/buy/a?embed=0')).searchParams.get('embed')).toBe('1');
  });
});

describe('Lemon.js bridge, server side', () => {
  it('does nothing and reports unavailable when there is no window (SSR)', async () => {
    const { initLemonSqueezy, overlayAvailable, openCheckoutOverlay } = await import('@/lib/lemon');
    expect(typeof window).toBe('undefined');
    expect(initLemonSqueezy()).toBe(false);
    expect(overlayAvailable()).toBe(false);
    expect(openCheckoutOverlay('https://x.lemonsqueezy.com/buy/a')).toBe(false);
  });
});

describe('parseCheckoutMessage — Lemon.js forwards EVERY window message', () => {
  it('recognises the three shapes Lemon.js sends', async () => {
    const { parseCheckoutMessage } = await import('@/lib/lemon');
    expect(parseCheckoutMessage('mounted')).toEqual({ type: 'mounted' });
    expect(parseCheckoutMessage('close')).toEqual({ type: 'closed' });
    expect(
      parseCheckoutMessage({ event: 'Checkout.Success', data: { type: 'orders', id: 42 } }),
    ).toEqual({ type: 'success', orderId: '42' });
  });

  it.each([
    ['an extension posting an object that looks like close', { event: 'close' }],
    ['a different Lemon.js event', { event: 'PaymentMethodUpdate.Closed' }],
    ['an arbitrary string', 'closed'],
    ['null', null],
    ['a number', 1],
    ['React DevTools traffic', { source: 'react-devtools-bridge', payload: {} }],
  ])('ignores %s', async (_label, data) => {
    const { parseCheckoutMessage } = await import('@/lib/lemon');
    expect(parseCheckoutMessage(data)).toBeNull();
  });
});

describe('after purchase', () => {
  it('navigates to the dashboard only when the receipt is closed after a success', async () => {
    const { createPostPurchaseListener, POST_PURCHASE_PATH } = await import('@/lib/lemon');
    const navigate = vi.fn();
    const listener = createPostPurchaseListener(navigate);

    listener({ type: 'mounted' });
    listener({ type: 'success', orderId: '1' });
    // The receipt — with the licence key — is still on screen. Stay put.
    expect(navigate).not.toHaveBeenCalled();

    listener({ type: 'closed' });
    expect(navigate).toHaveBeenCalledWith(POST_PURCHASE_PATH);
  });

  it('leaves a customer who closed without paying exactly where they were', async () => {
    const { createPostPurchaseListener } = await import('@/lib/lemon');
    const navigate = vi.fn();
    const listener = createPostPurchaseListener(navigate);
    listener({ type: 'mounted' });
    listener({ type: 'closed' });
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('API-created checkouts', () => {
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
          JSON.stringify({ data: { id: 'c1', attributes: { url: 'https://checkout.usecrawlable.com/checkout/custom/c1' } } }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetEnvCache();
  });

  async function optionsFor(overlay: boolean | undefined) {
    const { createCheckout } = await import('@/lib/lemonsqueezy');
    const { PLANS } = await import('@/lib/plans');
    await createCheckout({ plan: PLANS[0]!, ...(overlay === undefined ? {} : { overlay }) });
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    return body.data.attributes.checkout_options as { embed: boolean; logo: boolean };
  }

  it('hides the logo on every checkout', async () => {
    expect((await optionsFor(true)).logo).toBe(false);
    fetchMock.mockClear();
    expect((await optionsFor(false)).logo).toBe(false);
  });

  it('embeds only when the browser will open it in the overlay', async () => {
    expect((await optionsFor(true)).embed).toBe(true);
    fetchMock.mockClear();
    expect((await optionsFor(false)).embed).toBe(false);
    fetchMock.mockClear();
    // An old client that does not send the flag gets the safe full-page layout.
    expect((await optionsFor(undefined)).embed).toBe(false);
  });
});
