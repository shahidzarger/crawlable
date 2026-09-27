import { env } from '@/lib/env';

/**
 * Trader identity, in one place.
 *
 * Three separate rules want the same three facts, so they are read once here
 * rather than retyped into a footer, an email template and a policy page:
 *
 *   - CAN-SPAM (15 U.S.C. 7704(a)(5)) requires a valid physical postal
 *     address in every commercial email. The FTC counts each non-compliant
 *     message as its own violation, which is what makes "per email" real.
 *   - UAE and EU consumer rules require a trader's legal name and address to
 *     be identifiable before a purchase.
 *   - A returns or complaints address has to be somewhere a customer can find.
 *
 * Everything is optional and nothing is defaulted. A wrong address is a worse
 * failure than a missing one: it is an affirmative misstatement about who is
 * selling. Callers therefore handle absence explicitly, and
 * `canSendCommercialEmail` is the gate that keeps a non-compliant message from
 * going out at all.
 */

export interface BusinessIdentity {
  legalName: string | null;
  postalAddress: string | null;
  registration: string | null;
}

export function businessIdentity(): BusinessIdentity {
  const config = env();
  return {
    legalName: config.BUSINESS_LEGAL_NAME ?? null,
    postalAddress: config.BUSINESS_POSTAL_ADDRESS ?? null,
    registration: config.BUSINESS_REGISTRATION ?? null,
  };
}

/** The identity line for a footer: name, registration, address. */
export function identityLine(): string | null {
  const { legalName, postalAddress, registration } = businessIdentity();
  if (!legalName || !postalAddress) return null;
  const parts = [legalName];
  if (registration) parts.push(`Licence ${registration}`);
  parts.push(postalAddress);
  return parts.join(' · ');
}

/**
 * Whether a promotional email may legally be sent.
 *
 * Both conditions are non-negotiable under CAN-SPAM: a physical address to
 * print, and a working opt-out to offer. Missing either means the message
 * would be a violation, so the send is refused instead. Transactional mail —
 * a licence key, an audit-ready notice — is not gated by this, because it
 * carries neither requirement.
 */
export function canSendCommercialEmail(): { ok: boolean; reason: string | null } {
  const config = env();
  if (!config.BUSINESS_POSTAL_ADDRESS) {
    return { ok: false, reason: 'BUSINESS_POSTAL_ADDRESS is not set.' };
  }
  if (!config.UNSUBSCRIBE_SECRET) {
    return { ok: false, reason: 'UNSUBSCRIBE_SECRET is not set.' };
  }
  return { ok: true, reason: null };
}
