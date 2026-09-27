import { store } from '@/lib/db';
import { siteUrl } from '@/lib/env';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The opt-out endpoint. Two methods, because two different clients call it.
 *
 *   POST — the mailbox provider, per RFC 8058. Gmail and Yahoo press this
 *     themselves when the recipient uses the provider's own unsubscribe
 *     button, with no human present. It must answer 200 and do the work
 *     without a confirmation step.
 *   GET — the recipient, clicking the link in the footer. Redirects to a page
 *     that says what happened, because an opt-out that gives no feedback gets
 *     clicked again and then reported as spam.
 *
 * No authentication and no rate limit beyond the signature: the token IS the
 * authorisation, and someone unsubscribing themselves repeatedly is harmless.
 * An unsigned or tampered token suppresses nothing — without that check this
 * would be an endpoint for quietly unsubscribing other people's customers.
 */

async function optOut(token: string | null): Promise<'ok' | 'invalid' | 'error'> {
  if (!token) return 'invalid';

  const email = verifyUnsubscribeToken(token);
  if (!email) return 'invalid';

  try {
    const db = await store();
    await db.suppressEmail(email, 'unsubscribe-link');
    return 'ok';
  } catch (error) {
    console.error('[unsubscribe] Failed to record opt-out.', error);
    return 'error';
  }
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let token = url.searchParams.get('t');

  /*
   * Some providers post the List-Unsubscribe=One-Click body to the bare URL
   * rather than preserving the query string. Reading the body as a fallback
   * costs nothing and avoids an opt-out that silently does not happen.
   */
  if (!token) {
    try {
      const body = await request.text();
      token = new URLSearchParams(body).get('t');
    } catch {
      token = null;
    }
  }

  const outcome = await optOut(token);

  /*
   * 200 even for a bad token. A provider that gets a 4xx may retry, surface a
   * failure to the user, or count it against sender reputation — and there is
   * nothing the recipient can do about a malformed link anyway. The outcome is
   * in the body for our own logs.
   */
  return Response.json({ status: outcome }, { status: outcome === 'error' ? 500 : 200 });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const outcome = await optOut(url.searchParams.get('t'));
  return Response.redirect(`${siteUrl()}/unsubscribe?status=${outcome}`, 303);
}
