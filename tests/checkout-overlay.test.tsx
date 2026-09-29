// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

/**
 * The pricing table's buy buttons, clicked in a real DOM.
 *
 * The regression being prevented: a click that navigates the whole tab to the
 * checkout domain, leaving the customer with no way back but the browser's.
 * With Lemon.js present the click must open the overlay and stay on the page;
 * without it, the click must still reach a checkout — paying must never
 * depend on a third-party script loading.
 */

// The loader injects a remote <script>; nothing here should touch the network.
vi.mock('@/components/LemonSqueezyScript', () => ({ LemonSqueezyScript: () => null }));

const LINKS = {
  NEXT_PUBLIC_LS_BUY_SINGLE: 'https://checkout.usecrawlable.com/buy/single-uuid',
  NEXT_PUBLIC_LS_BUY_PACK: 'https://checkout.usecrawlable.com/buy/pack-uuid',
  NEXT_PUBLIC_LS_BUY_AGENCY: 'https://checkout.usecrawlable.com/buy/agency-uuid',
};

async function renderPricing() {
  vi.resetModules();
  for (const [key, value] of Object.entries(LINKS)) vi.stubEnv(key, value);
  const { Pricing } = await import('@/components/Pricing');
  const { PLANS } = await import('@/lib/plans');
  render(<Pricing />);
  const first = PLANS[0]!;
  return { link: screen.getByRole('link', { name: first.cta }), plan: first };
}

/**
 * Click, and report whether OUR code let the browser navigate.
 *
 * The decision is read at the document, after React's handler has run (React
 * listens at the root, the document sees the event after it). Then the
 * navigation is cancelled there — jsdom cannot navigate and would log an error
 * for every test where navigating is the correct outcome.
 */
function click(element: HTMLElement, init: MouseEventInit = {}): { navigated: boolean } {
  let navigated = false;
  const record = (event: Event) => {
    navigated = !event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener('click', record);
  fireEvent.click(element, init);
  document.removeEventListener('click', record);
  return { navigated };
}

const open = vi.fn();

beforeEach(() => {
  open.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete window.LemonSqueezy;
});

describe('with Lemon.js loaded', () => {
  beforeEach(() => {
    window.LemonSqueezy = {
      Setup: vi.fn(),
      Refresh: vi.fn(),
      Url: { Open: open, Close: vi.fn() },
    };
  });

  it('opens the overlay and does not navigate away', async () => {
    const { link } = await renderPricing();
    const { navigated } = click(link);

    expect(navigated).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('opens the right plan, embedded, logo shown, with the webhook metadata', async () => {
    const { link, plan } = await renderPricing();
    click(link);

    const url = new URL(open.mock.calls[0]?.[0] as string);
    expect(url.hostname).toBe('checkout.usecrawlable.com');
    expect(url.searchParams.get('embed')).toBe('1');
    expect(url.searchParams.get('logo')).toBe('1');
    expect(url.searchParams.get('checkout[custom][plan]')).toBe(plan.id);
  });

  it('does not lock the tiers, so closing the overlay leaves every button usable', async () => {
    const { link } = await renderPricing();
    click(link);
    expect(screen.queryByText(/Redirecting to checkout|Opening checkout/)).toBeNull();
  });

  it('leaves a modified click (new tab) to the browser, and does not lock', async () => {
    const { link } = await renderPricing();
    const { navigated } = click(link, { metaKey: true });
    expect(navigated).toBe(true);
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByText(/Redirecting to checkout/)).toBeNull();
  });

  it('unlocks the tiers when the overlay reports closed', async () => {
    const { onCheckoutEvent, initLemonSqueezy } = await import('@/lib/lemon');
    await renderPricing();

    // Capture the handler Lemon.js would call, as the loader installs it.
    let handler: ((event: unknown) => void) | undefined;
    window.LemonSqueezy!.Setup = (options) => {
      handler = options.eventHandler;
    };
    initLemonSqueezy();
    expect(handler).toBeTypeOf('function');

    // Sanity: the bridge delivers to subscribers.
    const seen: string[] = [];
    const off = onCheckoutEvent((event) => seen.push(event.type));
    act(() => handler?.('close'));
    off();
    expect(seen).toEqual(['closed']);
  });
});

describe('without Lemon.js (blocked, or not loaded yet)', () => {
  it('lets the link navigate, so the customer can still pay', async () => {
    const { link } = await renderPricing();
    expect(window.LemonSqueezy).toBeUndefined();

    const { navigated } = click(link);
    expect(navigated).toBe(true);
    // The href is the full-page checkout: no embed, logo shown.
    const href = new URL(link.getAttribute('href') as string);
    expect(href.searchParams.has('embed')).toBe(false);
    expect(href.searchParams.get('logo')).toBe('1');
    // The page is leaving, so the tiers lock against a double purchase.
    expect(screen.getByText('Redirecting to checkout…')).toBeTruthy();
  });
});
