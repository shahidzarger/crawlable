import { Resend } from 'resend';
import { env } from '@/lib/env';
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
}

export async function sendEmail(to: string, content: EmailContent): Promise<SendResult> {
  const provider = resend();

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
