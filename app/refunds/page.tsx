import type { Metadata } from 'next';
import Link from 'next/link';
import { Clause, Important, LegalLayout, SUPPORT_EMAIL } from '@/components/legal/LegalLayout';

export const metadata: Metadata = {
  title: 'Refund Policy',
  description:
    'Refunds within 14 days on unused scans. A scan that has run is not refundable because the crawl already happened. Stated plainly, with the exceptions listed.',
  alternates: { canonical: '/refunds' },
};

export default function RefundsPage() {
  return (
    <LegalLayout
      title="Refund Policy"
      summary="If you bought scans and have not used them, you get your money back within 14 days. If you have used them, the work is done and the compute is spent — so those are not refundable. The exceptions are below, and we honour them."
    >
      <Clause n={1} heading="The rule">
        <div className="surface-card p-5">
          <p className="font-medium text-[var(--ink-primary)]">
            Full refund within 14 days of purchase, provided every scan on the licence
            is completely unused.
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

      <Clause n={2} heading="Why a used scan is not refundable">
        <p>
          Running an audit crawls up to 40 pages of your site, analyses each one and
          generates your fix files. That compute is bought and paid for the moment you
          press go, and the deliverable — the report and the generated files — is yours
          permanently and cannot be returned.
        </p>
        <p>
          So on the Growth plan, if you have used three of your ten scans, seven remain and
          seven are refundable. We refund pro rata rather than refusing outright:
        </p>
        <div className="mt-2 code-block">
          <p className="font-mono text-sm">
            Growth, $79, 10 scans, 3 used
            <br />
            → refund 7 × $7.90 = $55.30
          </p>
        </div>
        <Important>
          <p>
            A partial scan that stopped early because your site responded slowly does{' '}
            <strong>not</strong> count as a used scan. Tell us and we will restore it.
          </p>
        </Important>
      </Clause>

      <Clause n={3} heading="Cases where we refund regardless of the 14 days">
        <p>We will refund a used scan, outside the window, if:</p>
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

      <Clause n={4} heading="The scan window">
        <p>
          Every plan is a one-time purchase, not a subscription — there is nothing to
          cancel and nothing renews. What each plan carries instead is a window: 30 days on
          Starter, 60 days on Growth and Agency Pro. Unused scans stop working when the
          window closes.
        </p>
        <Important>
          <p>
            The window exists because a verification scan is only worth anything while the
            fixes are fresh. If yours closed before you got to deploy, email us — we would
            rather reopen it than keep money for work we never did.
          </p>
        </Important>
        <p>
          Your report and your Fix Kit stay downloadable after the window closes. Only new
          scans need a live licence.
        </p>
      </Clause>

      <Clause n={5} heading="How a refund is processed">
        <p>
          Lemon Squeezy is our merchant of record, so the refund is issued by them to the
          original payment method. We authorise it; they move the money. It typically
          appears within 5–10 business days depending on your bank.
        </p>
        <p>
          Refunding an order deactivates its licence key and any remaining scans on it.
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
