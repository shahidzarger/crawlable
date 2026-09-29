// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MOUNT_TIMEOUT_MS,
  deliverLemonMessage,
  onCheckoutEvent,
  openCheckoutOverlay,
  resetCheckoutListeners,
} from '@/lib/lemon';

/**
 * The failure path a real browser found.
 *
 * Lemon.js removes its full-screen loading layer only when the checkout inside
 * the overlay posts "mounted". A checkout that never loads never posts it: the
 * customer sees an error in a full-screen frame with no close button, and even
 * after a close the invisible layer stays over the page, eating every click.
 */

const api = {
  Setup: vi.fn(),
  Refresh: vi.fn(),
  Url: { Open: vi.fn(), Close: vi.fn() },
  Loader: { Hide: vi.fn() },
};

function addLoaderLayer(): void {
  const layer = document.createElement('div');
  layer.className = 'lemonsqueezy-loader';
  document.body.appendChild(layer);
  document.body.classList.add('lemonsqueezy-loading');
}

let assigned: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  for (const fn of [api.Setup, api.Refresh, api.Url.Open, api.Url.Close, api.Loader.Hide]) fn.mockReset();
  window.LemonSqueezy = api;
  assigned = [];
  // jsdom cannot navigate; record where we would have gone.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign: (url: string) => assigned.push(url) },
  });
});

afterEach(() => {
  resetCheckoutListeners();
  vi.useRealTimers();
  delete window.LemonSqueezy;
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('a checkout that loads normally', () => {
  it('cancels the watchdog on "mounted": no teardown, no navigation', () => {
    openCheckoutOverlay('https://checkout.usecrawlable.com/buy/a', { fallbackUrl: 'https://checkout.usecrawlable.com/buy/a' });
    deliverLemonMessage('mounted');
    vi.advanceTimersByTime(MOUNT_TIMEOUT_MS * 2);
    expect(api.Url.Close).not.toHaveBeenCalled();
    expect(assigned).toEqual([]);
  });

  it('clears the loading layer on every close', () => {
    openCheckoutOverlay('https://checkout.usecrawlable.com/buy/a');
    deliverLemonMessage('close');
    expect(api.Loader.Hide).toHaveBeenCalled();
  });
});

describe('a checkout that never loads', () => {
  it('tears the overlay down, loading layer included', () => {
    openCheckoutOverlay('https://checkout.usecrawlable.com/buy/missing');
    addLoaderLayer();
    vi.advanceTimersByTime(MOUNT_TIMEOUT_MS);

    expect(api.Url.Close).toHaveBeenCalled();
    expect(api.Loader.Hide).toHaveBeenCalled();
    // Even if Loader.Hide is gone in some future Lemon.js, the layer is removed.
    expect(document.querySelectorAll('.lemonsqueezy-loader')).toHaveLength(0);
    expect(document.body.classList.contains('lemonsqueezy-loading')).toBe(false);
  });

  it('sends a buy link on to its full-page checkout', () => {
    const href = 'https://checkout.usecrawlable.com/buy/missing?logo=1';
    openCheckoutOverlay(href, { fallbackUrl: href });
    vi.advanceTimersByTime(MOUNT_TIMEOUT_MS);
    expect(assigned).toEqual([href]);
  });

  it('does not navigate an API checkout, which was built for the overlay; it reports instead', () => {
    const seen: string[] = [];
    onCheckoutEvent((event) => seen.push(event.type));
    openCheckoutOverlay('https://checkout.usecrawlable.com/checkout/custom/x', { fallbackUrl: null });
    vi.advanceTimersByTime(MOUNT_TIMEOUT_MS);
    expect(assigned).toEqual([]);
    expect(seen).toContain('stalled');
  });

  it('does not give up early on a slow connection', () => {
    openCheckoutOverlay('https://checkout.usecrawlable.com/buy/slow', { fallbackUrl: 'https://x' });
    vi.advanceTimersByTime(MOUNT_TIMEOUT_MS - 1);
    expect(api.Url.Close).not.toHaveBeenCalled();
    deliverLemonMessage('mounted');
    vi.advanceTimersByTime(MOUNT_TIMEOUT_MS);
    expect(assigned).toEqual([]);
  });

  it('only ever has one watchdog: reopening replaces it', () => {
    openCheckoutOverlay('https://checkout.usecrawlable.com/buy/a', { fallbackUrl: 'https://first' });
    vi.advanceTimersByTime(MOUNT_TIMEOUT_MS / 2);
    openCheckoutOverlay('https://checkout.usecrawlable.com/buy/b', { fallbackUrl: 'https://second' });
    vi.advanceTimersByTime(MOUNT_TIMEOUT_MS);
    expect(assigned).toEqual(['https://second']);
  });
});
