import { z } from 'zod';
import { enforceRateLimit, fail, ok, readJson } from '@/lib/api';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Contact form relay.
 *
 * This is the only unauthenticated endpoint in the app that causes email to be
 * sent, which makes it the obvious target for anyone who wants to use the
 * Brevo account as a free mailer. Three things guard it:
 *
 *   1. A rate limit per IP, because an open relay burns the sending quota and
 *      gets the domain listed as a spam source — and the reputation damage
 *      outlasts the abuse.
 *   2. Length caps on every field, so a megabyte of text cannot be pushed
 *      through the relay in one request.
 *   3. HTML escaping of everything the submitter controls before it is placed
 *      in the message body. The recipient is a human reading mail in Gmail;
 *      unescaped input means a contact form that delivers markup into an inbox.
 *
 * The From address is always our own verified sender. The submitter's address
 * goes in replyTo, so hitting Reply reaches them — putting their address in
 * `sender` instead would fail SPF/DKIM and land the mail in spam.
 */

const schema = z.object({
  name: z.string().trim().min(1, 'Tell us your name.').max(100, 'That name is too long.'),
  email: z
    .string()
    .trim()
    .min(1, 'An email address is required.')
    .max(254)
    .email('That does not look like a valid email address.'),
  message: z
    .string()
    .trim()
    .min(1, 'Please include a message.')
    .max(5000, 'Please keep the message under 5000 characters.'),
});

/** Escape the five characters that matter in an HTML body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strip characters that have meaning in a mail header.
 *
 * Brevo takes JSON rather than raw headers, so this is defence in depth rather
 * than a live injection path — but a name containing newlines has no
 * legitimate use and every reason to be refused.
 */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export async function POST(request: Request): Promise<Response> {
  // Five an hour is generous for a human and useless for a spammer.
  const limited = await enforceRateLimit(request, 'contact', 5, 3600);
  if (limited) return limited;

  const parsedBody = await readJson(request);
  if ('response' in parsedBody) return parsedBody.response;

  const parsed = schema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return fail(
      'invalid-input',
      parsed.error.issues[0]?.message ?? 'Check the form and try again.',
      400,
    );
  }

  const { name, email, message } = parsed.data;
  const config = env();

  if (!config.BREVO_API_KEY) {
    console.error('[contact] BREVO_API_KEY is not set; cannot relay the message.');
    return Response.json({ error: 'Email service not configured' }, { status: 500 });
  }

  const submittedAt = new Date().toISOString();

  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#111">
      <h2 style="margin:0 0 16px;font-size:18px">New contact form message</h2>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:16px;font-size:14px">
        <tr><td style="padding:2px 12px 2px 0;color:#666">Name</td><td><strong>${escapeHtml(name)}</strong></td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Submitted</td><td>${escapeHtml(submittedAt)}</td></tr>
      </table>
      <div style="border-left:3px solid #ddd;padding:4px 0 4px 14px;white-space:pre-wrap;font-size:14px">${escapeHtml(
        message,
      )}</div>
      <p style="margin-top:20px;font-size:12px;color:#888">
        Reply directly to this email to reach ${escapeHtml(name)}.
      </p>
    </div>
  `.trim();

  let response: Response;
  try {
    response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': config.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Crawlable Contact Form', email: config.CONTACT_EMAIL_FROM },
        to: [{ email: config.CONTACT_EMAIL_TO }],
        replyTo: { email, name: headerSafe(name) },
        subject: `Contact form — ${headerSafe(name)}`,
        htmlContent: html,
        textContent: `New contact form message\n\nName: ${name}\nEmail: ${email}\nSubmitted: ${submittedAt}\n\n${message}`,
      }),
    });
  } catch (error) {
    console.error('[contact] could not reach Brevo', error);
    return fail('relay-unreachable', 'Could not send your message. Please try again.', 502);
  }

  if (!response.ok) {
    /*
     * Brevo's error body is logged, not returned.
     *
     * It can name the account, the sender identity and the quota state — detail
     * that belongs in our logs rather than in a response to an anonymous
     * caller, who can do nothing with it anyway. The status code still says
     * the relay failed.
     */
    const detail = await response.text().catch(() => '<unreadable>');
    console.error('[contact] Brevo rejected the message', {
      status: response.status,
      detail,
    });
    return fail(
      'relay-failed',
      'Could not send your message right now. Please email us directly.',
      502,
    );
  }

  return ok({ success: true });
}
