import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, siteUrl } from '@/lib/env';

/**
 * Unsubscribe links that cannot be forged or enumerated.
 *
 * The link has to work with no login — the recipient of a marketing email has
 * no account here, and CAN-SPAM gives them ten business days to be removed,
 * not a sign-up flow. So the address travels in the URL, and an HMAC over it
 * proves the link came from us.
 *
 * What the signature buys: without it, `?email=` is an open endpoint for
 * suppressing anybody's address — a competitor could unsubscribe a customer
 * list one address at a time, and the damage would look like a deliverability
 * problem rather than an attack. The address is not a secret (the recipient
 * already knows it), so it is carried in the clear and only its authenticity
 * is protected.
 */

const SEPARATOR = '.';

function secret(): string | null {
  return env().UNSUBSCRIBE_SECRET ?? null;
}

/** Addresses are compared and signed in one canonical form. */
export function normaliseAddress(email: string): string {
  return email.trim().toLowerCase();
}

function sign(email: string, key: string): string {
  return createHmac('sha256', key).update(normaliseAddress(email)).digest('base64url');
}

/**
 * A signed token for one address, or null when signing is not configured.
 *
 * Null is the honest answer rather than an unsigned fallback: a link that
 * cannot be verified is worse than no link, because it would appear to work.
 */
export function unsubscribeToken(email: string): string | null {
  const key = secret();
  if (!key) return null;
  const address = normaliseAddress(email);
  return `${Buffer.from(address, 'utf8').toString('base64url')}${SEPARATOR}${sign(address, key)}`;
}

/** The address a token vouches for, or null if it does not verify. */
export function verifyUnsubscribeToken(token: string): string | null {
  const key = secret();
  if (!key) return null;

  const index = token.lastIndexOf(SEPARATOR);
  if (index <= 0) return null;

  const encoded = token.slice(0, index);
  const provided = token.slice(index + 1);

  let address: string;
  try {
    address = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!address.includes('@')) return null;

  const expected = sign(address, key);
  /*
   * Constant-time comparison, and a length check first because
   * timingSafeEqual throws on a length mismatch rather than returning false.
   * The timing leak here is mild, but a signature check that leaks its
   * progress byte by byte is a habit worth not forming.
   */
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return normaliseAddress(address);
}

/** The one-click URL printed in a commercial email, or null if unavailable. */
export function unsubscribeUrl(email: string): string | null {
  const token = unsubscribeToken(email);
  if (!token) return null;
  return `${siteUrl()}/api/unsubscribe?t=${encodeURIComponent(token)}`;
}
