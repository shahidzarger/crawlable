import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { SITE_URL } from '@/lib/site-url';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Crawlable — see what AI crawlers actually read on your site',
    template: '%s · Crawlable',
  },
  description:
    'AI crawlers do not run JavaScript. Crawlable audits your site the way GPTBot, ClaudeBot and PerplexityBot see it, then generates the llms.txt, robots.txt and JSON-LD that fix what it finds.',
  keywords: [
    'AI readability audit',
    'llms.txt generator',
    'GPTBot robots.txt',
    'answer engine optimization',
    'generative engine optimization',
    'AI crawler JavaScript rendering',
  ],
  openGraph: {
    type: 'website',
    siteName: 'Crawlable',
    title: 'See what AI crawlers actually read on your site',
    description:
      'Most AI crawlers never run your JavaScript. Find out how much of your site they can read — free, in about 20 seconds.',
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'See what AI crawlers actually read on your site',
    description:
      'Most AI crawlers never run your JavaScript. Find out how much of your site they can read.',
  },
  robots: { index: true, follow: true },
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
