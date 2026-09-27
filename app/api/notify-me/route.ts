import { z } from 'zod';
import { enforceRateLimit, fail, ok, readJson } from '@/lib/api';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Launch-notification signup.
 *
 * During the public beta the Fix Kit is visible but not purchasable, so the
 * report page offers to tell people when it opens. This relays the address to
 * the support inbox through the same Brevo sender the contact form uses.
 *
 * Deliberately not a new database table. At launch-window volume a mail per
 * signup is the whole feature, and a table would need a migration, an admin
 * view and a deletion path to be worth having. If signups outgrow an inbox,
 * that is the point to build the table — and a good problem.
 */

const schema = z.object({
  email: z.string().trim().min(1).max(254).email('That does not look like a valid email address.'),
  /** Where they were when they asked, so the reply can be specific. */
  context: z.string().trim().max(200).optional(),
});

export async function POST(request: Request): Promise<Response> {
  // Tighter than the contact form: this takes one field and no human writes
  // it twice.
  const limited = await enforceRateLimit(request, 'notify-me', 5, 3600);
  if (limited) return limited;

  const parsedBody = await readJson(request);
  if ('response' in parsedBody) return parsedBody.response;

  const parsed = schema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return fail(
      'invalid-input',
      parsed.error.issues[0]?.message ?? 'Check the address and try again.',
      400,
    );
  }

  const { email, context } = parsed.data;
  const config = env();

  if (!config.BREVO_API_KEY) {
    console.error('[notify-me] BREVO_API_KEY is not set; signup lost.', { context });
    return fail('not-configured', 'Could not record that right now. Please try again later.', 500);
  }

  const safeContext = (context ?? 'unknown').replace(/[\r\n<>]+/g, ' ');

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': config.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Crawlable', email: config.CONTACT_EMAIL_FROM },
        to: [{ email: config.CONTACT_EMAIL_TO }],
        replyTo: { email },
        subject: 'Fix Kit launch list signup',
        textContent: `${email} asked to be notified when Fix Kits open.\n\nContext: ${safeContext}\nAt: ${new Date().toISOString()}`,
      }),
    });

    if (!response.ok) {
      // Brevo's body can name the account and quota state; log it, do not
      // return it to an anonymous caller.
      console.error('[notify-me] Brevo rejected the relay', {
        status: response.status,
        detail: await response.text().catch(() => '<unreadable>'),
      });
      return fail('relay-failed', 'Could not record that right now. Please try again later.', 502);
    }
  } catch (error) {
    console.error('[notify-me] could not reach Brevo', error);
    return fail('relay-unreachable', 'Could not record that right now. Please try again later.', 502);
  }

  return ok({ success: true });
}
