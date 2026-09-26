import { FetchError, normaliseUrl } from '@/lib/audit/fetcher';

/** Website slots included with an active Agency Pro subscription. */
export const AGENCY_DOMAIN_SLOTS = 3;

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
  let hostname: string;
  try {
    hostname = normaliseUrl(input).hostname;
  } catch (error) {
    if (error instanceof FetchError) return null;
    return null;
  }

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
