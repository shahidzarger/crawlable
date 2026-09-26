import type { Metadata } from 'next';
import Link from 'next/link';
import { Clause, Important, LegalLayout, SUPPORT_EMAIL } from '@/components/legal/LegalLayout';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms covering use of Crawlable: what the audit is, what it is not, how the generated fix files are licensed, and where liability ends.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      summary="Crawlable measures what AI crawlers can read on your site and generates files that fix what it finds. It is a diagnostic tool, not a ranking service, and this page is explicit about that distinction."
    >
      <Clause n={1} heading="What the service does">
        <p>
          Crawlable fetches pages from a website you nominate, exactly as a non-rendering
          crawler would — raw HTML, no JavaScript execution — and reports what such a
          crawler can read. It checks your <code className="font-mono text-sm">robots.txt</code>{' '}
          against a registry of known AI crawler tokens, inspects headings, metadata and
          structured data, and generates suggested replacement files.
        </p>
        <p>
          Everything it produces is a measurement of your own site and a recommendation
          based on that measurement. You decide what to act on.
        </p>
      </Clause>

      <Clause n={2} heading="What the service does not do">
        <Important>
          <p>
            Crawlable does not influence, negotiate with, or have any relationship with
            OpenAI, Anthropic, Google, Perplexity, Meta or any other operator of an AI
            system or search engine. We cannot make your content appear in their answers,
            and nobody can sell you that outcome.
          </p>
        </Important>
        <p>
          Specifically, we make <strong>no representation or guarantee</strong> that
          following our recommendations will cause your site to be cited, indexed, ranked,
          retrieved, summarised or mentioned by any third-party model, assistant or search
          product; that any change will produce traffic, leads or revenue; or that a
          crawler which reads your site today will continue to do so.
        </p>
        <p>
          Those systems are operated by third parties who change their behaviour without
          notice and publish little about how they select sources. What we can tell you
          with confidence is whether your content is <em>readable</em> at all — which is a
          precondition for being used, not a promise of it.
        </p>
        <p>
          Scores and grades are our own editorial assessment against our own published
          weighting. They are not an industry standard and carry no external authority.
        </p>
      </Clause>

      <Clause n={3} heading="Your right to audit the site you submit">
        <p>
          By submitting a URL you confirm that you own the site, or are authorised by its
          owner to have it crawled. Our crawler identifies itself honestly as{' '}
          <code className="font-mono text-sm">CrawlableBot</code> and is rate-limited.
          Because the audit exists to measure what an AI crawler would receive, it fetches
          the pages you nominate regardless of{' '}
          <code className="font-mono text-sm">robots.txt</code> directives — which is
          precisely why the authorisation above is required rather than optional. The one
          directive it does obey is an explicit opt-out: a{' '}
          <code className="font-mono text-sm">User-agent: CrawlableBot</code> group that
          disallows <code className="font-mono text-sm">/</code> stops us before a single
          page is fetched. See{' '}
          <Link href="/bot" className="underline underline-offset-4">
            the CrawlableBot page
          </Link>
          .
        </p>
        <p>
          We only fetch content that is already publicly reachable without authentication.
          We do not attempt to bypass logins, paywalls or access controls, and requests to
          private, internal or loopback addresses are refused outright.
        </p>
      </Clause>

      <Clause n={4} heading="Licence for the files we generate">
        <p>
          The audit produces files intended for your site — typically{' '}
          <code className="font-mono text-sm">llms.txt</code>, a suggested{' '}
          <code className="font-mono text-sm">robots.txt</code>, JSON-LD structured data
          and a <code className="font-mono text-sm">FIXES.md</code> summary.
        </p>
        <p>
          <strong>These are yours.</strong> You may use, modify, publish, redistribute and
          commercialise them without restriction or attribution, including on behalf of
          clients. We claim no ownership of them and no ownership of your site&apos;s
          content. The licence survives cancellation, expiry and refund.
        </p>
        <p>
          The Crawlable application, its scoring methodology, its written guidance and its
          crawler registry remain ours.
        </p>
      </Clause>

      <Clause n={5} heading="Licence keys and acceptable use">
        <p>
          A licence key is your credential. We store only a SHA-256 hash of it and show
          only its last four characters, which means we cannot recover a lost key for you
          — keep it somewhere safe. Treat it like a password; you are responsible for
          activity under your key.
        </p>
        <p>You agree not to:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>submit sites you neither own nor are authorised to audit;</li>
          <li>use the service to probe, map or attack infrastructure;</li>
          <li>
            share, resell or pool a single licence key across parties it was not bought
            for (agency use across your own clients is expressly permitted);
          </li>
          <li>
            circumvent rate limits, quotas or credit accounting, or automate the interface
            to do so;
          </li>
          <li>
            resell the raw audit output as a competing automated product, as distinct from
            delivering reports to your own clients, which is fine.
          </li>
        </ul>
        <p>
          We may suspend a key we reasonably believe is being used this way. Where we do,
          we will say why, and unused credits will be refunded.
        </p>
      </Clause>

      <Clause n={6} heading="Availability">
        <p>
          The service is provided as-is. We do not offer an uptime commitment. Audits
          depend on third-party infrastructure and on the responsiveness of the site being
          audited; an audit may return a partial result when a site responds too slowly to
          finish within our processing budget, and the report will say so plainly when
          that happens.
        </p>
      </Clause>

      <Clause n={7} heading="Limitation of liability">
        <p>
          To the fullest extent permitted by law, our total liability arising out of or
          relating to the service is limited to the amount you paid us in the twelve
          months preceding the claim.
        </p>
        <p>
          We are not liable for indirect, incidental, special or consequential loss, nor
          for lost profits, lost traffic, lost rankings, lost visibility in any AI system,
          or lost data — including where such loss follows from acting on a recommendation
          we made.
        </p>
        <Important>
          <p>
            The files we generate change how crawlers and search engines treat your site.
            A mistaken{' '}
            <code className="font-mono text-sm">robots.txt</code> can remove you from
            search results. Review every generated file before publishing it, and keep a
            backup of what you replace. You are responsible for what you deploy.
          </p>
        </Important>
        <p>
          Nothing here excludes liability that cannot lawfully be excluded, including for
          fraud or for death or personal injury caused by negligence.
        </p>
      </Clause>

      <Clause n={8} heading="Payment, refunds and changes">
        <p>
          Payments are processed by Lemon Squeezy, which acts as merchant of record and is
          the seller for your transaction. Their terms govern the payment itself, and they
          handle applicable sales tax and VAT.
        </p>
        <p>
          Refund terms are set out on the{' '}
          <Link href="/refunds" className="underline underline-offset-4">
            refunds page
          </Link>
          . How we handle your data is described in our{' '}
          <Link href="/privacy" className="underline underline-offset-4">
            privacy policy
          </Link>
          .
        </p>
        <p>
          If we change these terms materially, the new version will be posted here with a
          new effective date before it applies. Continuing to use the service after that
          date means you accept the change; if you do not, stop using it and contact{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-4">
            {SUPPORT_EMAIL}
          </a>{' '}
          about any unused credits.
        </p>
      </Clause>
    </LegalLayout>
  );
}
