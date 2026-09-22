import {
  FetchError,
  assertPublicHost,
  isBlockedAddress,
  normaliseUrl,
} from '@/lib/audit/fetcher';

/**
 * Request-time validation for a user-supplied target URL.
 *
 * This is the public entry point a route handler should call before doing any
 * work on behalf of a stranger. It is a thin, well-typed façade over the
 * hardened primitives in `lib/audit/fetcher.ts` — deliberately so, because the
 * guarantees live in one place and the crawler and the API cannot drift apart.
 *
 * WHY THERE IS NO HOSTNAME BLOCKLIST HERE
 * ---------------------------------------
 * The obvious implementation is a list of bad strings — 'localhost',
 * '127.0.0.1', /^10\./, /^192\.168\./ — matched against the hostname. That
 * approach is worth understanding because it fails against every SSRF payload
 * anyone actually uses:
 *
 *   http://2130706433/            decimal encoding of 127.0.0.1
 *   http://0x7f.0x0.0x0.0x1/      hex encoding of the same
 *   http://127.1/                 shorthand; the OS expands it
 *   http://[::ffff:169.254.169.254]/   IPv4-mapped IPv6 metadata address
 *   http://metadata.google.internal/   a name, not an address
 *   http://evil.example/          an ordinary public hostname whose A record
 *                                 the attacker points at 169.254.169.254
 *
 * The last one is the important one. No amount of string matching can catch it,
 * because nothing about the hostname is suspicious — the danger is in what DNS
 * returns. So validation here RESOLVES the hostname and inspects every address
 * the resolver hands back, rejecting the request if any of them falls inside
 * private, loopback, link-local, CGNAT or multicast space.
 *
 * WHAT THIS DOES NOT COVER
 * ------------------------
 * Validating the entry URL is necessary but not sufficient. A permitted host
 * can still redirect to a forbidden one, and DNS can change between the check
 * and the connection (rebinding). Both are handled downstream in `safeFetch`,
 * which re-runs `assertPublicHost` before every hop rather than trusting this
 * result. Treat this module as the fast, friendly rejection at the edge — not
 * as the security boundary on its own.
 */

/** Stable machine-readable reasons a target can be refused. */
export type ValidationCode =
  | 'invalid-url'
  | 'blocked-host'
  | 'dns-failure';

export interface ValidationFailure {
  ok: false;
  code: ValidationCode;
  /** Safe to render directly in the UI. Never contains internal detail. */
  message: string;
  /** HTTP status a route should reply with. */
  status: 400 | 502;
}

export interface ValidationSuccess {
  ok: true;
  /** Normalised, fragment-stripped, scheme-qualified URL. */
  url: URL;
  origin: string;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

const STATUS_BY_CODE: Record<ValidationCode, 400 | 502> = {
  'invalid-url': 400,
  'blocked-host': 400,
  'dns-failure': 502,
};

/**
 * Syntactic checks only — no network. Enforces http/https, a sane length, a
 * parseable URL and a hostname that at least looks like a public domain.
 *
 * Exposed separately so a UI can validate as the user types without issuing a
 * DNS query per keystroke. It is NOT sufficient on its own: a URL that passes
 * this can still resolve straight into the private network.
 */
export function validateUrlSyntax(input: string): ValidationResult {
  try {
    const url = normaliseUrl(input);
    return { ok: true, url, origin: url.origin };
  } catch (error) {
    if (error instanceof FetchError) {
      return {
        ok: false,
        code: 'invalid-url',
        message: error.message,
        status: 400,
      };
    }
    return {
      ok: false,
      code: 'invalid-url',
      message: 'That does not look like a valid URL.',
      status: 400,
    };
  }
}

/**
 * Full validation: syntax, then DNS resolution with every returned address
 * checked against the blocked ranges.
 *
 * Returns a result rather than throwing, so a route handler can map it to a
 * response without a try/catch around its own control flow.
 */
export async function validateUrl(input: string): Promise<ValidationResult> {
  const syntax = validateUrlSyntax(input);
  if (!syntax.ok) return syntax;

  try {
    await assertPublicHost(syntax.url.hostname);
  } catch (error) {
    if (error instanceof FetchError) {
      const code: ValidationCode =
        error.code === 'dns-failure' ? 'dns-failure' : 'blocked-host';
      return {
        ok: false,
        code,
        message: error.message,
        status: STATUS_BY_CODE[code],
      };
    }
    return {
      ok: false,
      code: 'blocked-host',
      message: 'That host could not be verified as publicly reachable.',
      status: 400,
    };
  }

  return syntax;
}

/**
 * Re-exported so callers that already hold a literal address (a resolver
 * result, a header value) can apply the same range rules without a round trip.
 */
export { isBlockedAddress };
