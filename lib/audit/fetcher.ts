import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Hardened HTTP fetching for user-supplied URLs.
 *
 * Anything here runs against a hostname a stranger typed into a public form, so
 * every fetch is guarded against SSRF (private ranges, link-local, loopback),
 * oversized responses, slow-loris timeouts and redirect chains that walk out of
 * the allowed address space.
 */

export const USER_AGENT =
  'CrawlableBot/1.0 (+https://usecrawlable.com/bot; AI-readability auditor)';

/**
 * Hard ceiling on a single response body. Anything larger is truncated rather
 * than rejected — a 50MB page is still worth scoring on its first 3MB, and
 * truncation is reported so the score can account for it.
 *
 * 3MB is well above any real HTML document (the 99th percentile is under
 * 500KB) and low enough that an audit crawling 40 pages cannot exhaust a
 * 1GB serverless function even if every response is hostile.
 */
const MAX_BYTES = 3_000_000;
/**
 * Per-request timeout.
 *
 * Deliberately generous. The customers most likely to need this product are the
 * ones on sluggish shared WordPress and Shopify hosting, and a false "your site
 * timed out" on a first trial is worse than a slow audit. The function-level
 * budget is protected by the wall-clock deadline in `runAudit` instead, which
 * degrades gracefully rather than failing the whole crawl.
 */
const DEFAULT_TIMEOUT_MS = 12_000;
/** Redirects followed before giving up. */
const MAX_REDIRECTS = 5;

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  bytes: number;
  truncated: boolean;
  fetchMs: number;
}

/**
 * `URL.hostname` keeps the brackets around an IPv6 literal ("[::1]"), and
 * `net.isIP` rejects that form. Every address check must strip them first, or
 * a literal silently takes the hostname path and gets a DNS lookup instead of
 * a range check.
 */
function stripBrackets(host: string): string {
  return host.replace(/^\[|\]$/g, '');
}

export class FetchError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'invalid-url'
      | 'blocked-host'
      | 'dns-failure'
      | 'timeout'
      | 'too-many-redirects'
      | 'network'
      | 'unsupported-content',
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

/**
 * Normalise arbitrary user input into an absolute https/http URL.
 * Accepts "example.com", "example.com/path", "https://example.com".
 */
export function normaliseUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) throw new FetchError('No URL provided.', 'invalid-url');
  if (trimmed.length > 2048) {
    throw new FetchError('URL is too long.', 'invalid-url');
  }

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new FetchError(`"${input}" is not a valid URL.`, 'invalid-url');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchError('Only http and https URLs can be audited.', 'invalid-url');
  }
  /*
   * A public hostname needs a dot — but an IP literal legitimately may not
   * ("[::1]", and IPv6 generally). Letting literals through here is deliberate:
   * they are then judged by `assertPublicHost` on the address itself, which is
   * the check that should decide. Rejecting them on punctuation would refuse
   * them for a reason unrelated to why they are dangerous, and would quietly
   * stop working if this heuristic were ever relaxed.
   */
  if (!url.hostname || (!isIP(stripBrackets(url.hostname)) && !url.hostname.includes('.'))) {
    throw new FetchError(
      'That hostname does not look like a public domain.',
      'invalid-url',
    );
  }

  url.hash = '';
  return url;
}

/** Reduce a URL to its origin, which is what an audit is keyed on. */
export function toOrigin(input: string): string {
  return normaliseUrl(input).origin;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a = 0, b = 0] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local, covers cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

/**
 * Extract the embedded IPv4 address from an IPv4-mapped IPv6 address.
 *
 * Both spellings must be handled, and the second one is the one that bites:
 *
 *   ::ffff:127.0.0.1   what a human types
 *   ::ffff:7f00:1      what `new URL()` stores after normalising it
 *
 * Matching only the dotted form leaves `http://[::ffff:169.254.169.254]/` —
 * the cloud metadata endpoint — classified as a public address, because by the
 * time it reaches this function the dots are gone.
 */
function mappedIpv4(lower: string): string | null {
  const dotted = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted?.[1]) return dotted[1];

  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex?.[1] !== undefined && hex[2] !== undefined) {
    const high = Number.parseInt(hex[1], 16);
    const low = Number.parseInt(hex[2], 16);
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
  }

  return null;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  if (lower.startsWith('fe80')) return true; // link-local

  const mapped = mappedIpv4(lower);
  if (mapped) return isPrivateIpv4(mapped);

  /*
   * IPv4-compatible addresses (::a.b.c.d / ::7f00:1) are deprecated and have no
   * legitimate public use, but still route on some stacks. Anything else in ::/96
   * is refused rather than reasoned about.
   */
  if (lower.startsWith('::')) return true;

  return false;
}

export function isBlockedAddress(ip: string): boolean {
  const bare = stripBrackets(ip);
  const version = isIP(bare);
  if (version === 4) return isPrivateIpv4(bare);
  if (version === 6) return isPrivateIpv6(bare);
  return true;
}

/**
 * Resolve a hostname and refuse anything that points inside the private address
 * space. Called before every request, including after each redirect hop.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  const host = stripBrackets(hostname.toLowerCase());

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new FetchError('That host is not publicly reachable.', 'blocked-host');
  }

  if (isIP(host)) {
    if (isBlockedAddress(host)) {
      throw new FetchError('That address is in a private range.', 'blocked-host');
    }
    return;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new FetchError(`Could not resolve "${hostname}".`, 'dns-failure');
  }

  if (addresses.length === 0) {
    throw new FetchError(`Could not resolve "${hostname}".`, 'dns-failure');
  }
  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      throw new FetchError('That host resolves to a private address.', 'blocked-host');
    }
  }
}

async function readCapped(
  response: Response,
): Promise<{ body: string; bytes: number; truncated: boolean }> {
  if (!response.body) {
    const text = await response.text();
    const bytes = Buffer.byteLength(text);
    return { body: text, bytes, truncated: false };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      chunks.push(value.slice(0, value.byteLength - (bytes - MAX_BYTES)));
      truncated = true;
      await reader.cancel().catch(() => undefined);
      bytes = MAX_BYTES;
      break;
    }
    chunks.push(value);
  }

  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { body: buffer.toString('utf8'), bytes, truncated };
}

export interface FetchOptions {
  timeoutMs?: number;
  /** Override the User-Agent, used to probe crawler-specific behaviour. */
  userAgent?: string;
  /** Accept any content type rather than requiring text/*. */
  allowAnyContentType?: boolean;
}

/**
 * Fetch a URL the way a non-rendering AI crawler would: raw HTML, no JavaScript
 * execution, redirects re-validated at every hop.
 */
export async function safeFetch(
  target: string | URL,
  options: FetchOptions = {},
): Promise<FetchResult> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    userAgent = USER_AGENT,
    allowAnyContentType = false,
  } = options;

  const started = Date.now();
  let current = target instanceof URL ? target : normaliseUrl(target);
  const originalUrl = current.toString();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicHost(current.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en',
        },
      });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new FetchError(`Timed out after ${timeoutMs}ms.`, 'timeout');
      }
      throw new FetchError(
        error instanceof Error ? error.message : 'Network request failed.',
        'network',
      );
    }
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) break;
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new FetchError('Redirect target is not a valid URL.', 'network');
      }
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        throw new FetchError('Redirect left http(s).', 'blocked-host');
      }
      current = next;
      continue;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (
      !allowAnyContentType &&
      contentType &&
      !/text\/|json|xml|javascript/i.test(contentType)
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw new FetchError(
        `Unsupported content type: ${contentType}`,
        'unsupported-content',
      );
    }

    const { body, bytes, truncated } = await readCapped(response);
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    return {
      url: originalUrl,
      finalUrl: current.toString(),
      status: response.status,
      headers,
      body,
      bytes,
      truncated,
      fetchMs: Date.now() - started,
    };
  }

  throw new FetchError('Too many redirects.', 'too-many-redirects');
}

/**
 * Fetch that resolves to null instead of throwing, for optional resources such
 * as robots.txt and llms.txt where absence is a normal outcome.
 */
export async function tryFetch(
  target: string | URL,
  options: FetchOptions = {},
): Promise<FetchResult | null> {
  try {
    return await safeFetch(target, options);
  } catch {
    return null;
  }
}
