import type { Metadata } from 'next';
import { Clause, Important, LegalLayout, SUPPORT_EMAIL } from '@/components/legal/LegalLayout';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'What Crawlable collects, what it deliberately does not collect, how long it keeps anything, and how to have it deleted.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      summary="Crawlable has no user accounts, no advertising and no third-party analytics. This page lists everything it stores and why — the list is short by design."
    >
      <Clause n={1} heading="What we collect">
        <p>Three categories, and nothing else.</p>

        <h3 className="mt-6 text-base font-semibold text-[var(--ink-primary)]">
          Pages from the site you submit
        </h3>
        <p>
          When you run a scan or audit we fetch publicly reachable pages from the URL you
          give us and store the resulting analysis — word counts, headings, metadata,
          structured data, the readability verdict per page — along with extracts of the
          HTML needed to produce the report.
        </p>
        <p>
          This is content already published on the open web. We do not fetch anything
          behind a login or paywall, we do not attempt to bypass access controls, and
          requests to private or internal addresses are refused.
        </p>

        <h3 className="mt-6 text-base font-semibold text-[var(--ink-primary)]">
          Billing information, held by Lemon Squeezy
        </h3>
        <p>
          Lemon Squeezy is the merchant of record. Your card details go to them and never
          reach our servers. What we receive and store is an email address, an order
          identifier, which plan was bought, and a hash of your licence key.
        </p>
        <Important>
          <p>
            We store a SHA-256 hash of your licence key, never the key itself, and display
            only its last four characters. This means a breach of our database cannot yield
            working keys — and equally that we cannot recover a lost key for you.
          </p>
        </Important>

        <h3 className="mt-6 text-base font-semibold text-[var(--ink-primary)]">
          Server logs
        </h3>
        <p>
          Our host records standard request logs: timestamp, path, status code, user agent
          and IP address. We additionally keep a short-lived record of request counts per
          IP in order to enforce rate limits on the free scan.
        </p>
      </Clause>

      <Clause n={2} heading="What we deliberately do not collect">
        <ul className="ml-5 list-disc space-y-1">
          <li>No accounts, usernames or passwords — a licence key is the only credential.</li>
          <li>No card numbers or payment details; those stay with Lemon Squeezy.</li>
          <li>No third-party analytics, advertising pixels or session recording.</li>
          <li>No cross-site tracking, and no sale or sharing of data with data brokers.</li>
          <li>No marketing email unless you ask for it. Transactional email only.</li>
        </ul>
      </Clause>

      <Clause n={3} heading="Cookies">
        <p>
          Crawlable sets <strong>no tracking or advertising cookies</strong>, so there is
          no consent banner to dismiss.
        </p>
        <p>
          The dashboard keeps your licence key in your browser&apos;s local storage so you
          are not retyping it on every visit. That is local to your device, is never
          transmitted to us as a cookie, and clearing your browser data removes it.
        </p>
        <p>
          Lemon Squeezy sets its own cookies during checkout, on its own domain and under
          its own policy. We have no access to them.
        </p>
      </Clause>

      <Clause n={4} heading="How long we keep things">
        <div className="overflow-x-auto">
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-semibold">Data</th>
                <th className="py-2 pr-4 font-semibold">Retention</th>
              </tr>
            </thead>
            <tbody className="ink-secondary">
              <tr className="border-b">
                <td className="py-2 pr-4">Free scan results</td>
                <td className="py-2 pr-4">30 days, then deleted</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">Paid audit reports</td>
                <td className="py-2 pr-4">
                  24 months, so you can show before-and-after; deleted on request at any
                  time
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">Licence record and email</td>
                <td className="py-2 pr-4">
                  While the licence is active, then as long as tax law requires records of
                  the sale
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">Rate-limit counters</td>
                <td className="py-2 pr-4">Rolling window, hours not days</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Server logs</td>
                <td className="py-2 pr-4">Per our host&apos;s default, roughly 30 days</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Clause>

      <Clause n={5} heading="Who processes data on our behalf">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Vercel</strong> — hosting and server logs.
          </li>
          <li>
            <strong>Neon</strong> — the database holding licence records and reports.
          </li>
          <li>
            <strong>Lemon Squeezy</strong> — merchant of record; payments, invoicing and
            tax.
          </li>
          <li>
            <strong>Resend</strong> — delivery of transactional email such as your licence
            key and audit-ready notice.
          </li>
        </ul>
        <p>
          Each receives only what it needs for its function. Data may be processed in the
          United States and the European Union.
        </p>
      </Clause>

      <Clause n={6} heading="Your rights">
        <p>
          You may ask what we hold about you, ask for a copy, ask for it to be corrected,
          or ask for it to be deleted. Email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-4">
            {SUPPORT_EMAIL}
          </a>{' '}
          and we will respond within 30 days.
        </p>
        <p>
          Deletion removes your reports and licence record. It cannot be undone, it
          forfeits unused credits, and we may need to retain the bare transaction record
          where tax law requires it.
        </p>
        <p>
          If a site you do not own has been submitted for audit, tell us and we will remove
          the report.
        </p>
      </Clause>
    </LegalLayout>
  );
}
