import type { Metadata } from 'next';
import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/components/legal/LegalLayout';

export const metadata: Metadata = {
  title: 'Unsubscribed',
  description: 'Confirmation that you have been removed from Crawlable marketing email.',
  // Nothing to index: the page only ever says what just happened to one
  // address, and a search result for it would be meaningless.
  robots: { index: false, follow: false },
};

const MESSAGES = {
  ok: {
    heading: 'You are unsubscribed',
    body: 'We will not send you any more promotional email. Service messages about a purchase or an audit you run — your licence key, a report being ready — still reach you, because those are not marketing and you would want them.',
  },
  invalid: {
    heading: 'That link did not work',
    body: 'The link was incomplete or had been altered, so we have not changed anything. Use the unsubscribe link in the original email, or email us and we will remove you by hand.',
  },
  error: {
    heading: 'Something went wrong on our side',
    body: 'We could not record your request just now. Nothing about your address has changed. Please email us and we will remove you manually — you should not have to try twice.',
  },
} as const;

type Status = keyof typeof MESSAGES;

function toStatus(value: string | undefined): Status {
  return value === 'ok' || value === 'invalid' || value === 'error' ? value : 'invalid';
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const message = MESSAGES[toStatus(status)];

  return (
    <div className="mx-auto max-w-2xl px-4 py-20">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em]">{message.heading}</h1>
      <p className="mt-4 text-lg leading-relaxed ink-secondary">{message.body}</p>
      <p className="mt-8 text-sm ink-secondary">
        Questions, or want to be removed from everything including service mail? Email{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-4">
          {SUPPORT_EMAIL}
        </a>
        . See also our{' '}
        <Link href="/privacy" className="underline underline-offset-4">
          privacy policy
        </Link>
        .
      </p>
      <p className="mt-10">
        <Link href="/" className="text-sm underline underline-offset-4">
          Back to Crawlable
        </Link>
      </p>
    </div>
  );
}
