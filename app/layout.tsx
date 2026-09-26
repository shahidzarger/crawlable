import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { PRODUCTION_ORIGIN, SITE_URL } from '@/lib/site-url';
import { serialiseJsonLd, siteSchema } from '@/lib/seo/schema';

const DESCRIPTION =
  "Audit your site's visibility across ChatGPT Search, Claude, and Perplexity. " +
  'Get real-time crawl scores and automated Fix Kits.';

/**
 * Root metadata.
 *
 * metadataBase is the RESOLVED origin, not the production constant, so that a
 * relative OG image resolves against whatever host is serving the page. The
 * canonical is the production constant, because a canonical is a claim about
 * where the real page lives — and every public route overrides it with its own
 * path, while the two private routes (/dashboard, /audit/[id]) carry noindex.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Crawlable | Instant AI Search & LLM Visibility Audits',
    template: '%s | Crawlable - AI Search & LLM Visibility Audits',
  },
  description: DESCRIPTION,
  applicationName: 'Crawlable',
  keywords: [
    'AI readability audit',
    'LLM visibility',
    'ChatGPT Search optimisation',
    'llms.txt generator',
    'GPTBot robots.txt',
    'answer engine optimization',
    'generative engine optimization',
    'AI crawler JavaScript rendering',
  ],
  alternates: { canonical: PRODUCTION_ORIGIN },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: PRODUCTION_ORIGIN,
    siteName: 'Crawlable',
    title: 'Crawlable | Instant AI Search & LLM Visibility Audits',
    description: DESCRIPTION,
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Crawlable — AI search and LLM visibility audits',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Crawlable | Instant AI Search & LLM Visibility Audits',
    description: DESCRIPTION,
    images: ['/og.png'],
  },
  robots: { index: true, follow: true },
  icons: { icon: '/icon.png', apple: '/icon.png' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#08090c' },
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/*
          Site-wide Organization and SoftwareApplication markup. It sits in the
          root layout rather than on the home page so that every entry point —
          a shared crawler page, a platform guide — carries the publisher
          identity, which is what search engines attach the logo and the
          knowledge panel to.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serialiseJsonLd(siteSchema()) }}
        />
      </head>
      <body className="flex min-h-screen flex-col overflow-x-hidden antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:btn-primary"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
