import Link from 'next/link';
import type { Metadata } from 'next';
import { Scanner } from '@/components/Scanner';
import { Pricing } from '@/components/Pricing';
import { AI_CRAWLERS, NON_RENDERING_CRAWLERS } from '@/lib/audit/crawlers';
import { FAQS } from '@/content/faq';
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
                <span className="block">Your site looks fine.</span>
                <span className="block" style={{ color: 'var(--accent)' }}>
                  AI can&apos;t read it.
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-lg leading-relaxed ink-secondary">
                GPTBot, ClaudeBot and PerplexityBot fetch your raw HTML and never execute a
                line of your JavaScript. If your content arrives after hydration, it does not
                exist as far as they are concerned — and nobody tells you.
              </p>

              <p className="mt-4 max-w-xl leading-relaxed ink-secondary">
                Crawlable measures exactly how much of your site they can read, then generates
                the files that fix it.
              </p>

              <div className="mt-8 max-w-xl">
                <Scanner />
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
            Why this is invisible to you
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
            title="We fetch like a bot, not a browser"
            body="One HTTP request, no JavaScript engine, no hydration. Exactly what GPTBot gets, measured in words rather than opinions."
          />
          <Card
            step="02"
            title="We score what survives"
            body="Readable words, text-to-markup ratio, empty framework shells, heading structure, structured data, and which crawlers your robots.txt actually lets in."
          />
          <Card
            step="03"
            title="We hand you the fix"
            body="A generated llms.txt built from your real pages, a robots.txt that keeps your existing rules while unblocking retrieval crawlers, and the JSON-LD your pages are missing."
          />
        </div>
      </section>

      {/* Differentiation */}
      <section className="border-y" style={{ background: 'var(--surface-raised)' }}>
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">
                This is not another AI visibility tracker
              </h2>
              <p className="mt-4 leading-relaxed ink-secondary">
                The monitoring tools run prompts and report which brands got mentioned. Useful,
                and priced accordingly — $95 to $500 a month, forever.
              </p>
              <p className="mt-4 leading-relaxed ink-secondary">
                They all assume the crawler can read your site. That assumption is the thing
                worth checking first, and it is the one thing none of them check.
              </p>
            </div>

            <div className="surface-card overflow-hidden">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider ink-muted">
                    <th className="border-b px-5 py-3 font-medium">&nbsp;</th>
                    <th className="border-b px-5 py-3 font-medium">Trackers</th>
                    <th className="border-b px-5 py-3 font-medium">Crawlable</th>
                  </tr>
                </thead>
                <tbody>
                  <ComparisonRow
                    label="Answers"
                    them="What AI says about you"
                    us="What AI can read of you"
                  />
                  <ComparisonRow label="Price" them="$95–$500 / month" us="$39 once" />
                  <ComparisonRow
                    label="Output"
                    them="Dashboards and trends"
                    us="Files you paste today"
                  />
                  <ComparisonRow
                    label="Needed when"
                    them="You already rank"
                    us="Before anything else works"
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
          What lands in your inbox
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Deliverable
            file="llms.txt"
            body="Built from your actual page titles, descriptions and sections — not a blank template. Grouped into docs, products, blog and the rest."
          />
          <Deliverable
            file="robots.txt"
            body="Explicit Allow groups for the 8 retrieval crawlers, your existing wildcard rules carried over untouched, and a Sitemap directive."
          />
          <Deliverable
            file="schema.jsonld"
            body="Organization, WebSite and BreadcrumbList blocks filled in with your real name, URL and description. Paste and ship."
          />
          <Deliverable
            file="FIXES.md"
            body="Every finding ordered by what it costs you, with the affected URLs listed and a concrete remedy per item."
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

function ComparisonRow({ label, them, us }: { label: string; them: string; us: string }) {
  return (
    <tr>
      <td className="border-b px-5 py-3 text-xs uppercase tracking-wider ink-muted">
        {label}
      </td>
      <td className="border-b px-5 py-3 ink-secondary">{them}</td>
      <td className="border-b px-5 py-3 font-medium">{us}</td>
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
