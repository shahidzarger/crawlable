import type { Metadata } from 'next';
import Link from 'next/link';
import { Clause, Important, LegalLayout, SUPPORT_EMAIL } from '@/components/legal/LegalLayout';

export const metadata: Metadata = {
  title: 'Refund Policy',
  description:
    'Refunds within 14 days on unused audit credits. Spent credits are non-refundable because the crawl has already run. Stated plainly, with the exceptions listed.',
  alternates: { canonical: '/refunds' },
};

export default function RefundsPage() {
  return (
    <LegalLayout
      title="Refund Policy"
      summary="If you bought credits and have not used them, you get your money back within 14 days. If you have used them, the work is done and the compute is spent — so those are not refundable. The exceptions are below, and we honour them."
    >
      <Clause n={1} heading="The rule">
        <div className="surface-card p-5">
          <p className="font-medium text-[var(--ink-primary)]">
            Full refund within 14 days of purchase, provided every audit credit is
            completely unused.
          </p>
          <p className="mt-2 text-sm ink-secondary">
            No form, no justification required. Email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-4">
              {SUPPORT_EMAIL}
            </a>{' '}
            from your purchase address with your order number.
          </p>
        </div>
      </Clause>

      <Clause n={2} heading="Why a spent credit is not refundable">
        <p>
          Running an audit crawls up to 40 pages of your site, analyses each one and
          generates your fix files. That compute is bought and paid for the moment you
          press go, and the deliverable — the report and the generated files — is yours
          permanently and cannot be returned.
        </p>
        <p>
          So on the Growth Pack, if you have run two audits, three credits remain and three
          are refundable. We refund pro rata rather than refusing outright:
        </p>
        <div className="mt-2 code-block">
          <p className="font-mono text-sm">
            Growth Pack, $89, 5 credits, 2 used
            <br />
            → refund 3 × $17.80 = $53.40
          </p>
        </div>
        <Important>
          <p>
            A partial scan that stopped early because your site responded slowly does{' '}
            <strong>not</strong> count as a spent credit. Tell us and we will restore it.
          </p>
        </Important>
      </Clause>

      <Clause n={3} heading="Cases where we refund regardless of the 14 days">
        <p>We will refund a used credit, outside the window, if:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>the audit failed, returned an empty report, or never delivered your files;</li>
          <li>
            the report was materially wrong about your site in a way you can point to;
          </li>
          <li>
            you were charged twice, or charged for a plan other than the one you selected;
          </li>
          <li>
            a generated file we supplied caused a demonstrable problem on your site and we
            got it wrong;
          </li>
          <li>we suspended your key for a reason that turned out to be our mistake.</li>
        </ul>
        <p>
          These are not grudging exceptions. If the product did not do what it said, we do
          not want the money.
        </p>
      </Clause>

      <Clause n={4} heading="Subscriptions">
        <p>
          The monthly Agency Pro plan can be cancelled at any time from the link in your
          purchase email. Cancellation stops the next charge; the current period runs to
          its end and is not pro-rated, because your website slots and their unlimited
          re-audits have been available to you throughout it.
        </p>
        <p>
          If you cancel within 14 days of your <em>first</em> payment and have run no
          audits in that period, we refund that payment in full.
        </p>
      </Clause>

      <Clause n={5} heading="How a refund is processed">
        <p>
          Lemon Squeezy is our merchant of record, so the refund is issued by them to the
          original payment method. We authorise it; they move the money. It typically
          appears within 5–10 business days depending on your bank.
        </p>
        <p>
          Refunding an order deactivates its licence key and any remaining credits on it.
          Reports already generated stay accessible unless you also ask for deletion, which
          is covered in the{' '}
          <Link href="/privacy" className="underline underline-offset-4">
            privacy policy
          </Link>
          .
        </p>
      </Clause>

      <Clause n={6} heading="Try it before you pay">
        <p>
          The free scan analyses one page, checks your{' '}
          <code className="font-mono text-sm">robots.txt</code> against every AI crawler we
          track, and shows the real report format. It exists so that nobody has to buy in
          order to find out whether this is useful.
        </p>
        <p className="mt-4">
          <Link href="/#scan" className="btn-primary inline-block px-5 py-2.5 text-sm">
            Run a free scan
          </Link>
        </p>
      </Clause>
    </LegalLayout>
  );
}
