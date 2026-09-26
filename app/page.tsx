import Link from 'next/link';
import type { Metadata } from 'next';
import { Scanner } from '@/components/Scanner';
import { Pricing } from '@/components/Pricing';
import { AI_CRAWLERS, NON_RENDERING_CRAWLERS } from '@/lib/audit/crawlers';
import { FAQS } from '@/content/faq';
import { SEO_SUITE_PRICE_PROSE, SEO_SUITE_PRICE_RANGE } from '@/lib/benchmarks';
import { serialiseJsonLd } from '@/lib/seo/schema';

/*
 * The home page deliberately sets no title: it inherits the root default,
 * which is the one title that should not be run through the "%s | Crawlable"
 * template.
 */
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default function HomePage() {
  /*
   * FAQPage only. The SoftwareApplication and Organization nodes moved to the
   * root layout, where they are emitted once for every route — two
   * SoftwareApplication nodes describing the same product on one page is the
   * kind of ambiguity that makes a parser pick one and discard the other.
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: FAQS.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serialiseJsonLd(jsonLd) }}
      />

      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div aria-hidden className="grid-backdrop absolute inset-0 opacity-60" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24">
          {/*
            min-w-0 on both columns is load-bearing: a grid item defaults to
            min-width:auto, so the terminal's long <pre> lines would expand the
            column, the grid and the page, producing horizontal scroll on phones.
          */}
          <div className="grid gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
            <div className="min-w-0">
              <p
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
                style={{ borderColor: 'var(--border-strong)' }}
              >
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: 'var(--accent)' }}
                />
                {NON_RENDERING_CRAWLERS.length} of {AI_CRAWLERS.length} AI crawlers never run
                your JavaScript
              </p>

              <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.15rem]">
                <span className="block">Is your website invisible</span>
                <span className="block" style={{ color: 'var(--accent)' }}>
                  to AI search engines?
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-lg leading-relaxed ink-secondary">
                Traditional SEO is only half the battle. When someone searches on ChatGPT,
                Perplexity or Claude, will your site be cited — or ignored? Crawlable audits
                your raw-HTML extraction bottlenecks, generates ready-to-deploy Fix Kits (
                <code className="font-mono text-base">robots.txt</code>,{' '}
                <code className="font-mono text-base">sitemap.xml</code>,{' '}
                <code className="font-mono text-base">schema.jsonld</code>,{' '}
                <code className="font-mono text-base">llms.txt</code>), and re-scans to verify
                your score.
              </p>

              <div className="mt-8 max-w-xl">
                <Scanner />
                <p className="mt-4 text-sm ink-muted">
                  Engineered for web apps, modern websites, e-commerce, and agencies.
                </p>
              </div>
            </div>

            <div className="min-w-0 lg:pt-12">
              <TerminalDemo />
            </div>
          </div>
        </div>
      </section>

      {/* The mechanism */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Audit, patch, verify
          </h2>
          <p className="mt-4 text-lg leading-relaxed ink-secondary">
            Every tool you already use renders JavaScript before it looks. Your browser does.
            Google&apos;s crawler does. Your analytics do. So the one audience that does not —
            the crawlers feeding ChatGPT, Claude and Perplexity — is the one audience you have
            never actually seen your site through.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <Card
            step="01"
            title="Deep diagnostic crawl"
            body="Up to 40 pages fetched the way a non-rendering crawler fetches them — one HTTP request, no JavaScript engine. We audit crawler directives, bot permissions, structured schema and hydration dependencies, and score what actually survives."
          />
          <Card
            step="02"
            title="Instant code patches"
            body="Download a drop-in .zip: robots.txt with retrieval bots separated from training bots, a sitemap.xml built from your verified 200s, llms.txt written from your real pages, and a JSON-LD entity graph built from your site's real name, URL and description."
          />
          <Card
            step="03"
            title="Verification re-scan"
            body="Deploy the files, press re-scan with the verification scans included in your plan, and watch the readiness score move. A re-scan that shows no change says so plainly — that is the point of measuring twice."
          />
        </div>
      </section>

      {/* Dual optimisation: SEO and AEO */}
      <section className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Why both SEO and AEO?
            </h2>
            <p className="mt-4 text-lg leading-relaxed ink-secondary">
              They are not the same job. Google renders your JavaScript and has crawled you
              for years; the answer engines mostly do neither. Optimising for one and
              assuming it covers the other is how a site ranks perfectly well and still never
              gets cited.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <div className="surface-card p-6 sm:p-8">
              <h3 className="text-xl font-semibold tracking-tight">For Google and Bing</h3>
              <p className="mt-2 text-sm leading-relaxed ink-secondary">
                The classic technical layer, still worth getting right.
              </p>
              <ul className="mt-5 space-y-3 text-sm">
                <Point>
                  <strong>A sitemap.xml you can start from.</strong> We read your existing
                  sitemap to choose which pages to crawl, then generate valid sitemaps.org
                  XML from the URLs that came back 200.
                </Point>
                <Point>
                  <strong>Canonical hygiene.</strong> Trailing-slash variants and tracking
                  parameters split one page into several in an index. We collapse them before
                  crawling, so your score and your generated sitemap count each page once.
                </Point>
                <Point>
                  <strong>JSON-LD schema parsing.</strong> Every structured-data block is
                  parsed and validated rather than counted, because malformed JSON-LD is
                  indistinguishable from none at all.
                </Point>
              </ul>
            </div>

            <div
              className="surface-card p-6 sm:p-8"
              style={{ borderColor: 'var(--accent)' }}
            >
              <h3 className="text-xl font-semibold tracking-tight">
                For AI answer engines
              </h3>
              <p className="mt-2 text-sm leading-relaxed ink-secondary">
                Perplexity, ChatGPT Search and Claude — where the rules are different.
              </p>
              <ul className="mt-5 space-y-3 text-sm">
                <Point>
                  <strong>Whitelist the retrieval bots.</strong>{' '}
                  <code className="font-mono text-xs">OAI-SearchBot</code>,{' '}
                  <code className="font-mono text-xs">PerplexityBot</code> and{' '}
                  <code className="font-mono text-xs">Claude-SearchBot</code> fetch pages to
                  answer a question someone is asking right now. Blocking them removes you
                  from the answer.
                </Point>
                <Point>
                  <strong>Separate them from the training bots.</strong>{' '}
                  <code className="font-mono text-xs">GPTBot</code> and{' '}
                  <code className="font-mono text-xs">Google-Extended</code> are a
                  content-licensing decision with no effect on visibility. Most robots.txt
                  files block all of them together, by accident.
                </Point>
                <Point>
                  <strong>Serve readable raw HTML.</strong>{' '}
                  {NON_RENDERING_CRAWLERS.length} of the {AI_CRAWLERS.length} crawlers we
                  track never run your JavaScript. Content that arrives after hydration does
                  not exist to them.
                </Point>
                <Point>
                  <strong>Deploy llms.txt.</strong> A short Markdown map of what your site is
                  and where its important pages are, written for a context window rather than
                  a search index.
                </Point>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Differentiation */}
      <section className="border-y" style={{ background: 'var(--surface-raised)' }}>
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">
                This is not another recurring SEO subscription
              </h2>
              <p className="mt-4 leading-relaxed ink-secondary">
                Legacy enterprise SEO suites charge upwards of {SEO_SUITE_PRICE_PROSE} every
                month on a recurring retainer — and what you get for it is a diagnostic
                report telling you what is broken.
              </p>
              <p className="mt-4 leading-relaxed ink-secondary">
                They also focus on keyword ranks while assuming a modern AI crawler can read
                your client-rendered pages. Crawlable checks what actually decides AI
                discovery: raw-HTML extraction, retrieval bot permissions, structured data
                and heading structure. Then, instead of handing you homework, it generates
                the production-ready files that fix what it found.
              </p>
            </div>

            <div className="surface-card overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider ink-muted">
                    <th className="border-b px-4 py-3 font-medium">&nbsp;</th>
                    <th className="border-b px-4 py-3 font-medium">Legacy SEO suites</th>
                    <th className="border-b px-4 py-3 font-medium">AI rank trackers</th>
                    <th className="border-b px-4 py-3 font-medium">
                      Crawlable (Fix &amp; Verify)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <ComparisonRow
                    label="Pricing"
                    legacy={`${SEO_SUITE_PRICE_RANGE} / month`}
                    trackers="Monthly subscription"
                    us="$29–$199 one-time"
                  />
                  <ComparisonRow
                    label="What you get"
                    legacy="A list of errors, no code"
                    trackers="Prompt mentions over time"
                    us="Automated Fix Kit: robots.txt, sitemap.xml, schema.jsonld, llms.txt"
                  />
                  <ComparisonRow
                    label="Verification"
                    legacy="Re-audit while you keep paying"
                    trackers="Re-checks while you keep paying"
                    us="Included re-scans to verify the fix landed"
                  />
                  <ComparisonRow
                    label="What it measures"
                    legacy="Keyword ranks and backlinks"
                    trackers="What AI says about you"
                    us="What AI can actually read of you"
                  />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          The Fix Kit
        </h2>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed ink-secondary">
          Five files in a .zip, built from your own crawl rather than a template. Four are
          drop-in; schema.jsonld leaves two social handles and a search URL for you to fill
          in. FIXES.md says where each one belongs.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Deliverable
            file="robots.txt"
            body="Retrieval crawlers allowed explicitly, training crawlers listed separately so blocking them stays a licensing decision rather than an accident. Your existing wildcard Disallow rules are carried over, with a Sitemap directive appended."
          />
          <Deliverable
            file="sitemap.xml"
            body="Valid sitemaps.org XML built only from canonical URLs the crawl confirmed returning 200 — no redirects, no 404s, no tracking parameters. It covers the pages this audit crawled, so a larger site gets a correct template to extend rather than a replacement sitemap."
          />
          <Deliverable
            file="llms.txt"
            body="Built from your actual page titles, descriptions and sections — not a blank template. Grouped into docs, products, blog and the rest, sized for a context window."
          />
          <Deliverable
            file="schema.jsonld"
            body="An entity graph: Organization and WebSite with SearchAction, plus BreadcrumbList when your site has nested pages — filled in with your real name, URL and description, with placement instructions inline."
          />
          <Deliverable
            file="FIXES.md"
            body="Every finding ordered by what it costs you, with the affected URLs listed, a concrete remedy per item, and the deployment order for the four files above."
          />
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-6xl px-4 py-8 pb-20">
        <Pricing />
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-t">
        <div className="mx-auto max-w-3xl px-4 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">Questions</h2>
          <dl className="mt-10 space-y-8">
            {FAQS.map((faq) => (
              <div key={faq.question}>
                <dt className="font-medium">{faq.question}</dt>
                <dd className="mt-2 leading-relaxed ink-secondary">{faq.answer}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-14 surface-card p-6 text-center">
            <h3 className="text-xl font-semibold tracking-tight">
              Find out in twenty seconds
            </h3>
            <p className="mt-2 text-sm ink-secondary">
              The free scan is a real measurement of a real page on your real site.
            </p>
            <Link href="/#scan" className="btn-primary mt-5 inline-block px-6 py-3 text-sm">
              Scan my site
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function Point({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 leading-relaxed ink-secondary">
      <span aria-hidden className="mt-1.5 shrink-0" style={{ color: 'var(--accent)' }}>
        →
      </span>
      <span>{children}</span>
    </li>
  );
}

function Card({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <div className="surface-card p-6">
      <span className="font-mono text-xs ink-muted">{step}</span>
      <h3 className="mt-3 font-medium leading-snug">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed ink-secondary">{body}</p>
    </div>
  );
}

function Deliverable({ file, body }: { file: string; body: string }) {
  return (
    <div className="surface-card p-5">
      <code
        className="inline-block rounded-md px-2 py-1 font-mono text-xs"
        style={{ background: 'var(--surface-sunken)', color: 'var(--accent)' }}
      >
        {file}
      </code>
      <p className="mt-3 text-sm leading-relaxed ink-secondary">{body}</p>
    </div>
  );
}

/**
 * One row of the category comparison.
 *
 * Three columns rather than two, because "legacy SEO suite" and "AI rank
 * tracker" are different products with different failure modes, and collapsing
 * them into one "them" column was what made the old table read as a strawman.
 * No third party is named: the comparison is about delivery models, which do
 * not change monthly the way a competitor's price list does.
 */
function ComparisonRow({
  label,
  legacy,
  trackers,
  us,
}: {
  label: string;
  legacy: string;
  trackers: string;
  us: string;
}) {
  return (
    <tr>
      <td className="border-b px-4 py-3 text-xs uppercase tracking-wider ink-muted">
        {label}
      </td>
      <td className="border-b px-4 py-3 ink-secondary">{legacy}</td>
      <td className="border-b px-4 py-3 ink-secondary">{trackers}</td>
      <td className="border-b px-4 py-3 font-medium">{us}</td>
    </tr>
  );
}

/** A static illustration of the difference between the two fetches. */
function TerminalDemo() {
  return (
    <div className="surface-card overflow-hidden">
      <div
        className="flex items-center gap-2 border-b px-4 py-2.5"
        style={{ background: 'var(--surface-sunken)' }}
      >
        <span aria-hidden className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--border-strong)' }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--border-strong)' }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--border-strong)' }} />
        </span>
        <span className="font-mono text-xs ink-muted">what GPTBot receives</span>
      </div>

      <pre className="code-block overflow-x-auto border-0 p-4 leading-relaxed">
        <code>
          <span className="ink-muted">$ curl -A &quot;GPTBot&quot; https://yoursite.com</span>
          {'\n\n'}
          {'<!doctype html>'}
          {'\n'}
          {'<html lang="en">'}
          {'\n'}
          {'  <head>'}
          {'\n'}
          {'    <title>Home</title>'}
          {'\n'}
          {'    <script src="/_next/static/chunks/main.js" defer></script>'}
          {'\n'}
          {'  </head>'}
          {'\n'}
          {'  <body>'}
          {'\n'}
          <span style={{ color: 'var(--data-bad)' }}>{'    <div id="__next"></div>'}</span>
          {'\n'}
          {'  </body>'}
          {'\n'}
          {'</html>'}
          {'\n\n'}
          <span className="ink-muted">{'# 0 words of content. 14 scripts.'}</span>
          {'\n'}
          <span style={{ color: 'var(--data-bad)' }}>
            {'# Everything you wrote is in the JavaScript.'}
          </span>
        </code>
      </pre>

      <div className="border-t px-4 py-3">
        <p className="text-xs ink-secondary">
          Your visitors never see this. Neither do you — your browser runs the scripts. The
          crawler does not.
        </p>
      </div>
    </div>
  );
}
