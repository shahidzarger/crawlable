import { Resend } from 'resend';
import { env } from '@/lib/env';
import { canSendCommercialEmail } from '@/lib/legal';
import { store } from '@/lib/db';
import type { EmailContent } from './templates';

/**
 * Email delivery.
 *
 * Email is deliberately non-fatal: a failed send must never fail a purchase or
 * an audit. Every call returns a result the caller can log and move on from.
 * With RESEND_API_KEY unset, sends are skipped and reported as such, so local
 * development works without an email provider.
 */

let client: Resend | null = null;

function resend(): Resend | null {
  const key = env().RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

export interface SendResult {
  sent: boolean;
  id: string | null;
  skipped: boolean;
  error: string | null;
  /** Set when the address is on the opt-out list. Not an error. */
  suppressed?: boolean;
}

export async function sendEmail(to: string, content: EmailContent): Promise<SendResult> {
  const provider = resend();

  /*
   * Commercial mail is gated before anything else happens.
   *
   * CAN-SPAM requires a physical postal address and a working opt-out in any
   * message whose primary purpose is promotional, and counts each
   * non-compliant message as its own violation — the FTC's current maximum is
   * $53,088 per email. So a missing address or unsubscribe secret stops the
   * send instead of degrading it. Failing closed costs one nudge email;
   * failing open costs per recipient.
   *
   * Transactional mail — a licence key, an audit-ready notice — is not gated:
   * it carries neither requirement, and withholding somebody's licence key
   * over a marketing rule would be its own kind of wrong.
   */
  if (content.kind === 'commercial') {
    const allowed = canSendCommercialEmail();
    if (!allowed.ok) {
      return {
        sent: false,
        id: null,
        skipped: true,
        error: `Commercial email refused: ${allowed.reason} See lib/legal.ts.`,
      };
    }
    if (!content.unsubscribeUrl) {
      return {
        sent: false,
        id: null,
        skipped: true,
        error: 'Commercial email refused: template produced no unsubscribe URL.',
      };
    }
  }

  /*
   * The opt-out list, honoured for commercial mail only.
   *
   * Someone who unsubscribes from marketing has not asked to stop receiving
   * their own receipts, and CAN-SPAM's opt-out right does not extend to
   * transactional messages. Suppressing those too would mean a customer who
   * clicked unsubscribe silently never receives the licence key they paid for.
   *
   * A store that cannot be reached does not block the send: an outage must not
   * become an email outage. The list is checked again on the next send.
   */
  if (content.kind === 'commercial') {
    try {
      const db = await store();
      if (await db.isEmailSuppressed(to)) {
        return { sent: false, id: null, skipped: true, error: null, suppressed: true };
      }
    } catch (error) {
      console.error('[email] Suppression check failed; sending anyway.', error);
    }
  }

  if (!provider) {
    return {
      sent: false,
      id: null,
      skipped: true,
      error: 'RESEND_API_KEY not configured — email skipped.',
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { sent: false, id: null, skipped: false, error: `Invalid recipient: ${to}` };
  }

  try {
    const response = await provider.emails.send({
      from: env().EMAIL_FROM,
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
      /*
       * One-click unsubscribe, per RFC 8058.
       *
       * Gmail and Yahoo have required this of bulk senders since February
       * 2024, and it is what puts the mailbox provider's own "Unsubscribe"
       * button next to the subject line. The List-Unsubscribe-Post header is
       * the half that makes it one click rather than a link to a page: without
       * it, providers fall back to opening the URL. Both are needed, and only
       * on commercial mail — advertising an unsubscribe route out of a receipt
       * would be a way to lose your own licence key.
       */
      ...(content.kind === 'commercial' && content.unsubscribeUrl
        ? {
            headers: {
              'List-Unsubscribe': `<${content.unsubscribeUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }
        : {}),
    });

    if (response.error) {
      return {
        sent: false,
        id: null,
        skipped: false,
        error: response.error.message,
      };
    }

    return { sent: true, id: response.data?.id ?? null, skipped: false, error: null };
  } catch (error) {
    return {
      sent: false,
      id: null,
      skipped: false,
      error: error instanceof Error ? error.message : 'Unknown email error.',
    };
  }
}
