/**
 * Domain keying.
 *
 * Deliberately dependency-free. This used to call normaliseUrl from the
 * fetcher, which drags node:dns and node:net into anything that imports it —
 * fine on the server, fatal in a Client Component, and the re-scan panel is a
 * Client Component that needs to know which domain a report is about. The
 * parsing here is a strict subset of what the fetcher does: it can only be
 * more permissive, never less, so a host this accepts and the fetcher rejects
 * simply never gets registered, and the UI fails closed.
 *
 * Slot allowances are per-plan and live in lib/plans.ts. There is no single
 * AGENCY_DOMAIN_SLOTS constant any more — Starter tracks 1, Growth 3 and
 * Agency Pro 15.
 */

/**
 * Reduce any URL a customer types to the hostname a slot is keyed on.
 *
 *   https://www.example.com/pricing?a=1  ->  example.com
 *   EXAMPLE.COM.                         ->  example.com
 *   http://example.com:8443/             ->  example.com
 *
 * `www.` is stripped so the obvious pair does not burn two of three slots.
 * Nothing else is: `shop.example.com` and `example.com` remain separate
 * slots. Collapsing arbitrary subdomains would need a public suffix list to
 * avoid mangling `example.co.uk`, and guessing wrong in that direction would
 * silently merge two client sites into one slot — which is worse for an
 * agency than an extra slot being consumed, because it loses data.
 */
export function normaliseDomain(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let hostname: string;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    hostname = url.hostname;
  } catch {
    return null;
  }

  /*
   * A public hostname has a dot in it, or is an IPv6 literal.
   *
   * This is what rejects the inputs that survive the scheme prefixing above:
   * "file:///etc/passwd" and "javascript:void(0)" both parse once https:// is
   * prepended, and both yield a single-label hostname ("file", "javascript")
   * that no slot should ever be keyed on. The fetcher applies the same test
   * for the same reason.
   */
  if (!hostname.includes('.') && !hostname.includes(':')) return null;

  const bare = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .replace(/^www\./, '');

  return bare || null;
}

/** Display helper: the domain, or the raw value when it could not be parsed. */
export function domainLabel(value: string): string {
  return normaliseDomain(value) ?? value;
}
