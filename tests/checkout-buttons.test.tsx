// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { Pricing } from '@/components/Pricing';
import { PLANS } from '@/lib/plans';
import { CHECKOUT_REQUEST_TIMEOUT_MS, useCheckout } from '@/components/useCheckout';

/**
 * The buy buttons: create a checkout on the server, then navigate the tab.
 *
 * What these guard: the button always says what is happening, a double click
 * cannot create two checkouts, a failure leaves every button usable, and Back
 * from the checkout never returns to a page frozen on "Redirecting…".
 */

const CHECKOUT_URL = 'https://checkout.usecrawlable.com/checkout/custom/abc?signature=s';
let navigatedTo: string[] = [];
const fetchMock = vi.fn();

function reply(status: number, body: unknown) {
  return async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  navigatedTo = [];
  // jsdom cannot navigate; record where the tab would have gone.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      get href() {
        return 'http://localhost/#pricing';
      },
      set href(url: string) {
        navigatedTo.push(url);
      },
    },
  });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const first = PLANS[0]!;
const buttonFor = (label: string) => screen.getByRole('button', { name: label });

describe('a successful purchase start', () => {
  it('asks the server for this plan and sends the whole tab to the checkout', async () => {
    fetchMock.mockImplementation(reply(200, { url: CHECKOUT_URL }));
    render(<Pricing />);
    fireEvent.click(buttonFor(first.cta));

    await waitFor(() => expect(navigatedTo).toEqual([CHECKOUT_URL]));
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe('/api/checkout');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ plan: first.id });
  });

  it('shows the loading state on the clicked tier and locks the others while it waits', async () => {
    let release: (value: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (release = resolve)));
    render(<Pricing />);
    fireEvent.click(buttonFor(first.cta));

    expect(await screen.findByText('Redirecting to checkout…')).toBeTruthy();
    for (const plan of PLANS.slice(1)) {
      expect((buttonFor(plan.cta) as HTMLButtonElement).disabled).toBe(true);
    }
    await act(async () => release(new Response(JSON.stringify({ url: CHECKOUT_URL }), { status: 200 })));
  });

  it('guards against a second start in the same tick, before any re-render', async () => {
    // The disabled attribute covers clicks; this covers callers that start()
    // twice before React has committed — the case the synchronous ref exists for.
    fetchMock.mockImplementation(reply(200, { url: CHECKOUT_URL }));
    const { result } = renderHook(() => useCheckout());
    await act(async () => {
      void result.current.start('single');
      void result.current.start('pack');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ plan: 'single' });
  });

  it('never creates two checkouts from a double click', async () => {
    fetchMock.mockImplementation(reply(200, { url: CHECKOUT_URL }));
    render(<Pricing />);
    const button = buttonFor(first.cta);
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(navigatedTo).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('when starting a checkout fails', () => {
  it('shows the server’s message and unlocks every tier', async () => {
    fetchMock.mockImplementation(reply(502, { error: 'Could not start checkout. Try again.' }));
    render(<Pricing />);
    fireEvent.click(buttonFor(first.cta));

    expect(await screen.findByText('Could not start checkout. Try again.')).toBeTruthy();
    expect(navigatedTo).toEqual([]);
    for (const plan of PLANS) expect((buttonFor(plan.cta) as HTMLButtonElement).disabled).toBe(false);
  });

  it('recovers from a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<Pricing />);
    fireEvent.click(buttonFor(first.cta));
    expect(await screen.findByText(/Could not reach the checkout service/)).toBeTruthy();
    expect((buttonFor(first.cta) as HTMLButtonElement).disabled).toBe(false);
  });

  it('refuses to navigate to a non-https URL', async () => {
    fetchMock.mockImplementation(reply(200, { url: 'javascript:alert(1)' }));
    render(<Pricing />);
    fireEvent.click(buttonFor(first.cta));
    expect(await screen.findByText(/Could not start checkout/)).toBeTruthy();
    expect(navigatedTo).toEqual([]);
  });

  it('gives up on a hung request instead of spinning forever', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    );
    render(<Pricing />);
    fireEvent.click(buttonFor(first.cta));
    await act(async () => {
      vi.advanceTimersByTime(CHECKOUT_REQUEST_TIMEOUT_MS + 10);
    });
    expect(await screen.findByText(/taking too long/)).toBeTruthy();
    expect((buttonFor(first.cta) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('coming back with the Back button', () => {
  it('unlocks the tiers when the page is restored from the back/forward cache', async () => {
    fetchMock.mockImplementation(reply(200, { url: CHECKOUT_URL }));
    render(<Pricing />);
    fireEvent.click(buttonFor(first.cta));
    await waitFor(() => expect(navigatedTo).toHaveLength(1));
    // Still locked: the tab was leaving.
    expect(screen.getByText('Redirecting to checkout…')).toBeTruthy();

    const restored = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(restored, 'persisted', { value: true });
    act(() => {
      window.dispatchEvent(restored);
    });

    expect(screen.queryByText('Redirecting to checkout…')).toBeNull();
    for (const plan of PLANS) expect((buttonFor(plan.cta) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('nothing of the overlay remains', () => {
  it('loads no Lemon.js and renders no buy links', () => {
    render(<Pricing />);
    expect(document.querySelector('script[src*="lemon"]')).toBeNull();
    expect(document.querySelectorAll('a[href*="checkout.usecrawlable.com"]')).toHaveLength(0);
  });
});
