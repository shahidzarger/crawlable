import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactForm } from '@/components/ContactForm';
import { SUPPORT_EMAIL } from '@/components/legal/LegalLayout';

/**
 * Contact page.
 *
 * The form is the client component; this shell stays a server component so the
 * page keeps its metadata and canonical URL, which is the same split the
 * marketing pages use for the scanner.
 */

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Questions about an audit, a licence key, billing or a refund. Send a message and a person will read it, usually replying within one business day.',
  alternates: { canonical: '/contact' },
};

const TOPICS = [
  {
    heading: 'Something went wrong with an audit',
    body: 'Include the domain and roughly when you ran it. If a crawl stopped early or came back empty, say so — we restore the credit.',
  },
  {
    heading: 'Licence keys, credits and billing',
    body: 'Tell us the last four characters of your key rather than the whole thing. We can see the rest from our side.',
  },
  {
    heading: 'Refunds',
    body: 'The policy is written out in full, including the cases we honour outside the 14 days.',
    href: '/refunds',
    linkText: 'Read the refund policy',
  },
  {
    heading: 'Something the product gets wrong',
    body: 'If a report was wrong about your site in a way you can point to, that is the most useful mail we get. Send it.',
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <nav className="text-xs ink-muted">
        <Link href="/" className="hover:text-[var(--ink-secondary)]">
          Crawlable
        </Link>{' '}
        / Contact
      </nav>

      <h1 className="mt-4 text-4xl font-semibold tracking-tight">Contact us</h1>

      <p className="mt-4 text-lg leading-relaxed ink-secondary">
        There is no ticket queue and no chatbot in front of this form. Messages go
        straight to the inbox we read, and replies usually go out within one business
        day.
      </p>

      <div className="mt-10 surface-card p-6 sm:p-8">
        <ContactForm />
      </div>

      <p className="mt-4 text-sm ink-muted">
        Prefer your own mail client? Write to{' '}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="underline underline-offset-4 hover:text-[var(--ink-primary)]"
        >
          {SUPPORT_EMAIL}
        </a>
        . It reaches exactly the same place.
      </p>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">
          What to include, by topic
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {TOPICS.map((topic) => (
            <div key={topic.heading} className="surface-card p-5">
              <h3 className="text-sm font-semibold tracking-tight">{topic.heading}</h3>
              <p className="mt-2 text-sm leading-relaxed ink-secondary">{topic.body}</p>
              {topic.href ? (
                <Link
                  href={topic.href}
                  className="mt-3 inline-block text-sm underline underline-offset-4 ink-secondary hover:text-[var(--ink-primary)]"
                >
                  {topic.linkText} →
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <div className="mt-12 flex flex-wrap gap-4 border-t pt-6 text-sm">
        <Link href="/terms" className="ink-secondary hover:text-[var(--ink-primary)]">
          Terms
        </Link>
        <Link href="/privacy" className="ink-secondary hover:text-[var(--ink-primary)]">
          Privacy
        </Link>
        <Link href="/refunds" className="ink-secondary hover:text-[var(--ink-primary)]">
          Refunds
        </Link>
      </div>
    </div>
  );
}
