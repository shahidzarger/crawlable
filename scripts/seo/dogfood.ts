/**
 * Dog-food check: run Crawlable's own analyser over Crawlable's own pages.
 *
 *   npm run seo:dogfood                against http://localhost:3000
 *   npm run seo:dogfood -- https://... against a deployed site
 *
 * A tool that tells people to serve readable HTML has to serve readable HTML.
 * This fails the build if any public marketing page comes back as a shell or
 * below the thin-content floor.
 */

import { analyseHtml } from '../../lib/audit/extract';
import { PLATFORMS } from '../../content/platforms';
import { AI_CRAWLERS } from '../../lib/audit/crawlers';

const MIN_WORDS = 250;

async function main(): Promise<void> {
  const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');

  const paths = [
    '/',
    '/platforms',
    '/ai-crawlers',
    ...PLATFORMS.map((p) => `/platforms/${p.slug}`),
    ...AI_CRAWLERS.map((c) => `/ai-crawlers/${c.token.toLowerCase()}`),
  ];

  let failures = 0;

  console.log(`\nAuditing ${paths.length} of our own pages as a non-rendering crawler\n`);
  console.log(`${'PATH'.padEnd(34)} ${'WORDS'.padStart(6)} ${'TEXT%'.padStart(6)}  SHELL  SCHEMA`);
  console.log('-'.repeat(72));

  for (const path of paths) {
    const response = await fetch(base + path, { headers: { 'User-Agent': 'GPTBot' } });
    const html = await response.text();

    const page = analyseHtml({
      url: base + path,
      html,
      status: response.status,
      bytes: Buffer.byteLength(html),
      fetchMs: 0,
      contentType: response.headers.get('content-type') ?? 'text/html',
    });

    const thin = page.rawWordCount < MIN_WORDS;
    const bad = page.isSpaShell || thin;
    if (bad) failures += 1;

    console.log(
      `${path.padEnd(34)} ${String(page.rawWordCount).padStart(6)} ` +
        `${(page.textToHtmlRatio * 100).toFixed(1).padStart(6)}  ` +
        `${String(page.isSpaShell).padEnd(6)} ${page.schemaTypes.join(',') || '—'}` +
        `${bad ? '   <-- FAIL' : ''}`,
    );
  }

  console.log('');
  if (failures > 0) {
    console.error(`${failures} page(s) would fail our own audit.`);
    process.exitCode = 1;
  } else {
    console.log('Every page is readable without JavaScript.');
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
