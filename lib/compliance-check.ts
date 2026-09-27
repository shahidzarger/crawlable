import { env } from '@/lib/env';
import { canSendCommercialEmail } from '@/lib/legal';

/**
 * Configuration checks for the obligations that are configuration-shaped.
 *
 * These are the ones with a per-message or per-recipient penalty attached, so
 * the failure mode is not "a page looks wrong" but "every send was a separate
 * violation". A missing postal address is invisible until an email goes out;
 * this endpoint makes it visible on demand instead.
 *
 * Deliberately not a claim of legal compliance. It checks that the things the
 * code needs in order to behave lawfully are present — nothing here evaluates
 * the wording of a policy or whether a business is correctly registered.
 */

export interface ComplianceItem {
  id: string;
  /** What is being checked, in one line. */
  check: string;
  /** Why it matters, including the rule it relates to. */
  because: string;
  ok: boolean;
  detail: string;
}

export interface ComplianceReport {
  status: 'ok' | 'incomplete';
  /** True when promotional email can legally be sent right now. */
  commercialEmailEnabled: boolean;
  items: ComplianceItem[];
  /**
   * The trap this endpoint cannot detect on its own.
   *
   * This route is dynamic, so it reads the live environment and will happily
   * report "Set" the moment a variable exists. The site footer is on
   * statically prerendered pages, so it carries whatever the value was AT
   * BUILD TIME. Setting BUSINESS_POSTAL_ADDRESS in Vercel without
   * redeploying therefore produces a green check here and an empty footer in
   * public — so the note ships with the report rather than living in a README
   * nobody reads at the moment it matters.
   */
  note: string;
}

export function checkCompliance(): ComplianceReport {
  const config = env();
  const commercial = canSendCommercialEmail();

  const items: ComplianceItem[] = [
    {
      id: 'postal-address',
      check: 'BUSINESS_POSTAL_ADDRESS is set',
      because:
        'CAN-SPAM 15 U.S.C. 7704(a)(5) requires a valid physical postal address in every commercial email; the FTC treats each non-compliant message as a separate violation. UAE and EU consumer rules separately require the trader to be identifiable.',
      ok: Boolean(config.BUSINESS_POSTAL_ADDRESS),
      detail: config.BUSINESS_POSTAL_ADDRESS
        ? 'Set. Printed in every email footer and in the site footer.'
        : 'Not set. Promotional email is refused, and the site footer omits the identity block.',
    },
    {
      id: 'legal-name',
      check: 'BUSINESS_LEGAL_NAME is set',
      because:
        'The registered trading name has to appear alongside the address for the identity block to mean anything.',
      ok: Boolean(config.BUSINESS_LEGAL_NAME),
      detail: config.BUSINESS_LEGAL_NAME
        ? 'Set.'
        : 'Not set. The footer identity block needs both a name and an address before it renders.',
    },
    {
      id: 'unsubscribe-secret',
      check: 'UNSUBSCRIBE_SECRET is set',
      because:
        'Unsubscribe links are signed. Without the key they cannot be verified, so no working opt-out can be offered — and a promotional email without one is the violation.',
      ok: Boolean(config.UNSUBSCRIBE_SECRET),
      detail: config.UNSUBSCRIBE_SECRET
        ? 'Set. One-click unsubscribe and List-Unsubscribe headers are active.'
        : 'Not set. Promotional email is refused.',
    },
    {
      id: 'registration',
      check: 'BUSINESS_REGISTRATION is set',
      because:
        'Optional. A trade licence or company number shown with the name makes the trader verifiable, which is expected of a UAE-licensed business selling online.',
      ok: true,
      detail: config.BUSINESS_REGISTRATION ? 'Set.' : 'Not set. Optional — the block renders without it.',
    },
  ];

  return {
    /*
     * 'incomplete' rather than 'error': nothing is broken and the product
     * works. What is true is that promotional email will not send until these
     * are filled in, which is the intended behaviour, not a fault.
     */
    status: items.every((item) => item.ok) ? 'ok' : 'incomplete',
    commercialEmailEnabled: commercial.ok,
    items,
    note:
      'Email is checked at send time and reflects the live environment. The site footer is statically prerendered, so it shows the value from the last build — after changing any BUSINESS_* variable, redeploy or the public footer stays stale. This check is configuration only and is not a legal opinion.',
  };
}
