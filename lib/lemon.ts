import { POST_PURCHASE_PATH, overlayCheckoutUrl } from '@/lib/checkout-links';

/**
 * The browser side of the Lemon.js checkout overlay.
 *
 * Everything here touches `window`, and every function checks for it first,
 * so this module is safe to import from a component that renders on the
 * server. Nothing runs at import time.
 *
 * Written against the Lemon.js source (assets.lemonsqueezy.com/lemon.js), not
 * just its docs, because three of its behaviours decide how this has to work:
 *
 *   1. `window.LemonSqueezy` is created inside a `window.load` listener. A
 *      script injected after hydration — which is what next/script's
 *      afterInteractive does — routinely arrives AFTER `load` has fired, so
 *      the listener never runs and the object never exists. Every click then
 *      silently falls back to a full-page redirect. `createLemonSqueezy()` has
 *      to be called by hand; initLemonSqueezy does that.
 *
 *   2. `Setup({ eventHandler })` stores exactly one handler, and Lemon.js
 *      passes it every `message` event the window receives — from any frame,
 *      extension or dev tool — with no origin check. So there is one handler,
 *      installed here, that recognises only the shapes Lemon.js sends and fans
 *      them out to subscribers.
 *
 *   3. The overlay's close button works by posting "close" to the parent. It
 *      only functions inside the iframe, which is why embed=1 is applied to the
 *      overlay URL and never to the anchor's href.
 */

export interface LemonSqueezyApi {
  Setup: (options: { eventHandler: (event: unknown) => void }) => void;
  Refresh: () => void;
  Url: {
    Open: (url: string) => void;
    Close: () => void;
  };
  /**
   * Present in the Lemon.js source but not in its documented API, so it is
   * typed optional and always called with ?. — if a future version drops it,
   * the cleanup below degrades to a no-op rather than a crash.
   */
  Loader?: {
    Hide: () => void;
  };
}

declare global {
  interface Window {
    LemonSqueezy?: LemonSqueezyApi;
    createLemonSqueezy?: () => void;
  }
}

/** The official loader URL. It redirects to the asset host, which may move. */
export const LEMON_JS_SRC = 'https://app.lemonsqueezy.com/js/lemon.js';

export type CheckoutEvent =
  | { type: 'mounted' }
  | { type: 'closed' }
  | { type: 'success'; orderId: string | null }
  /** The checkout never finished loading inside the overlay. Ours, not Lemon.js's. */
  | { type: 'stalled' };

type Listener = (event: CheckoutEvent) => void;
const listeners = new Set<Listener>();

/** Subscribe to overlay events. Returns the unsubscribe function. */
export function onCheckoutEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Translate a raw message into a checkout event, or null if it is not one.
 *
 * Lemon.js hands over every window message unfiltered, so anything that is
 * not exactly one of its three shapes is ignored. A browser extension that
 * posts {event: 'close'} or a stray "mounted" string from some other widget
 * must not unlock the pricing table or navigate the page.
 */
export function parseCheckoutMessage(data: unknown): CheckoutEvent | null {
  if (data === 'mounted') return { type: 'mounted' };
  if (data === 'close') return { type: 'closed' };
  if (
    typeof data === 'object' &&
    data !== null &&
    (data as { event?: unknown }).event === 'Checkout.Success'
  ) {
    const order = (data as { data?: { id?: unknown } }).data;
    const id = order?.id;
    return { type: 'success', orderId: typeof id === 'string' || typeof id === 'number' ? String(id) : null };
  }
  return null;
}

function emit(event: CheckoutEvent): void {
  for (const listener of listeners) listener(event);
}

/**
 * How long a checkout may take to appear before we give up on the overlay.
 *
 * Generous on purpose: this is a recovery path, not a performance budget, and
 * giving up on a checkout that was about to appear on a slow connection would
 * be its own small disaster. Measured against the `mounted` message the
 * checkout posts once it has rendered.
 */
export const MOUNT_TIMEOUT_MS = 20_000;

let watchdog: ReturnType<typeof setTimeout> | null = null;
let stallFallbackUrl: string | null = null;

function clearWatchdog(): void {
  if (watchdog !== null) clearTimeout(watchdog);
  watchdog = null;
  stallFallbackUrl = null;
}

/**
 * Remove every trace of the overlay, including the loading layer.
 *
 * Found in a real browser against the real Lemon.js: its full-screen loading
 * layer (white, 90% opaque, z-index 99998) is removed ONLY when the checkout
 * inside the iframe posts "mounted". If the checkout never loads — a deleted
 * variant, an outage, an extension blocking the domain — that message never
 * comes, and closing the overlay removes the iframe but leaves the layer over
 * the page, swallowing every click. The page looks fine and nothing works.
 */
function teardown(): void {
  try {
    window.LemonSqueezy?.Url.Close();
  } catch {
    // Nothing open. Carry on to the loader.
  }
  window.LemonSqueezy?.Loader?.Hide();
  for (const layer of document.querySelectorAll('.lemonsqueezy-loader')) layer.remove();
  document.body.classList.remove('lemonsqueezy-loading', 'lemonsqueezy-open');
}

function dispatch(raw: unknown): void {
  const event = parseCheckoutMessage(raw);
  if (!event) return;
  if (event.type === 'mounted') clearWatchdog();
  if (event.type === 'closed') {
    clearWatchdog();
    // A close must always leave a usable page, whatever state Lemon.js is in.
    window.LemonSqueezy?.Loader?.Hide();
  }
  emit(event);
}

/** Test hook: deliver a raw message exactly as Lemon.js would. */
export const deliverLemonMessage = dispatch;

/**
 * Create (or refresh) the Lemon.js instance and install our one handler.
 *
 * Idempotent, and meant to be called every time the loader mounts:
 * createLemonSqueezy() builds the object on first call and only re-scans for
 * buttons after that, and Setup() simply replaces the stored handler with the
 * same function. A client-side navigation that re-mounts the loader therefore
 * costs nothing and cannot stack handlers.
 */
export function initLemonSqueezy(): boolean {
  if (typeof window === 'undefined') return false;
  window.createLemonSqueezy?.();
  const api = window.LemonSqueezy;
  if (!api) return false;
  api.Setup({ eventHandler: dispatch });
  return true;
}

/** True when a click can open the overlay right now. */
export function overlayAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.LemonSqueezy?.Url?.Open === 'function';
}

/**
 * Open a checkout in the overlay. Returns false when that is not possible, in
 * which case the caller lets the ordinary link navigation happen instead.
 *
 * The fallback is not a failure mode to hide: an ad blocker or a strict
 * network policy that blocks lemonsqueezy.com is common, and a buyer behind
 * one must still be able to pay. They get the full-page checkout. That page's
 * header links the store name to the storefront, which no URL parameter can
 * remove — see applyDisplayParams in lib/checkout-links.ts.
 */
export function openCheckoutOverlay(
  checkoutUrl: string,
  options: {
    /**
     * Where to send the customer if the overlay never loads. The full-page
     * checkout for a buy link. Null for an API-created checkout, which was
     * built for the embedded layout — the caller shows an error instead.
     */
    fallbackUrl?: string | null;
  } = {},
): boolean {
  if (!overlayAvailable()) return false;
  try {
    clearWatchdog();
    window.LemonSqueezy?.Url.Open(overlayCheckoutUrl(checkoutUrl));
  } catch (error) {
    console.error('[checkout] Lemon.js could not open the overlay; falling back.', error);
    return false;
  }

  /*
   * The watchdog. Without it, a checkout that fails to load leaves the
   * customer looking at an error inside a full-screen frame with no close
   * button — Lemon Squeezy's close button is part of the checkout that did
   * not load. Stranded again, just inside the overlay instead of on another
   * site. After MOUNT_TIMEOUT_MS the overlay is torn down and the customer is
   * either taken to the full-page checkout or told what happened.
   */
  stallFallbackUrl = options.fallbackUrl ?? null;
  watchdog = setTimeout(() => {
    const fallback = stallFallbackUrl;
    clearWatchdog();
    teardown();
    emit({ type: 'stalled' });
    if (fallback) window.location.assign(fallback);
  }, MOUNT_TIMEOUT_MS);
  return true;
}

/** Where a customer goes after closing the receipt of a successful purchase. */
export { POST_PURCHASE_PATH };

/**
 * The listener that turns "paid, then closed the receipt" into a navigation.
 *
 * Lemon Squeezy keeps the overlay open on its confirmation screen after
 * payment, and that screen shows the licence key — so success alone does
 * nothing but remember. Only the close that follows it navigates. A close
 * WITHOUT a preceding success (the customer changed their mind) leaves them
 * exactly where they were.
 *
 * Pure apart from the injected `navigate`, so it is tested without a browser.
 */
export function createPostPurchaseListener(navigate: (path: string) => void): Listener {
  let purchased = false;
  return (event) => {
    if (event.type === 'success') purchased = true;
    if (event.type === 'closed' && purchased) {
      purchased = false;
      navigate(POST_PURCHASE_PATH);
    }
  };
}

/** Test-only: drop every subscriber and any pending watchdog. */
export function resetCheckoutListeners(): void {
  listeners.clear();
  clearWatchdog();
}
