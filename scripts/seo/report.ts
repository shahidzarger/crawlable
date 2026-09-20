/**
 * Programmatic SEO coverage report.
 *
 * Prints every generated URL, its target query shape and its word count, so you
 * can see the corpus as a whole and spot thin pages before search engines do.
 *
 *   npm run seo:report
 *   npm run seo:report -- --check   exit non-zero if any page is too thin
 */

import { PLATFORMS } from '../../content/platforms';
import { AI_CRAWLERS } from '../../lib/audit/crawlers';
import { CRAWLER_NOTES } from '../../content/crawler-notes';

/**
 * Floors for the *source data* behind each page, not the rendered page.
 *
 * A rendered page also carries shared explanatory prose, code snippets and
 * headings, so it runs meaningfully longer than its data. `npm run seo:dogfood`
 * measures the rendered pages against the real 250-word floor; this report is
 * about whether the underlying corpus has enough unique substance to justify
 * the page existing at all.
 */
const MIN_WORDS = { platform: 200, crawler: 80 } as const;

interface Row {
  url: string;
  query: string;
  words: number;
  kind: 'platform' | 'crawler';
}

function countWords(...parts: (string | string[] | undefined)[]): number {
  return parts
    .flatMap((part) => (Array.isArray(part) ? part : [part ?? '']))
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function buildRows(): Row[] {
  const rows: Row[] = [];

  for (const platform of PLATFORMS) {
    rows.push({
      kind: 'platform',
      url: `/platforms/${platform.slug}`,
      query: `can ai crawlers read ${platform.name.toLowerCase()} / does chatgpt index ${platform.name.toLowerCase()}`,
      words: countWords(
        platform.verdict,
        platform.mechanism,
        platform.fixes,
        platform.gotchas,
        platform.filePlacement,
      ),
    });
  }

  for (const crawler of AI_CRAWLERS) {
    const note = CRAWLER_NOTES[crawler.token];
    rows.push({
      kind: 'crawler',
      url: `/ai-crawlers/${crawler.token.toLowerCase()}`,
      query: `what is ${crawler.token.toLowerCase()} / should i block ${crawler.token.toLowerCase()}`,
      words: countWords(
        crawler.note,
        note?.consequence,
        note?.verification,
        note?.commonMistake,
      ),
    });
  }

  return rows;
}

function main(): void {
  const check = process.argv.includes('--check');
  const rows = buildRows();

  const urlWidth = Math.max(...rows.map((row) => row.url.length), 3);

  console.log(`\nProgrammatic SEO corpus: ${rows.length} generated pages\n`);
  console.log(`${'URL'.padEnd(urlWidth)}  ${'WORDS'.padStart(6)}  TARGET QUERY`);
  console.log('-'.repeat(urlWidth + 8 + 40));

  let thin = 0;

  for (const row of rows) {
    const isThin = row.words < MIN_WORDS[row.kind];
    if (isThin) thin += 1;
    const flag = isThin ? ' (thin)' : '';
    console.log(
      `${row.url.padEnd(urlWidth)}  ${String(row.words).padStart(6)}  ${row.query}${flag}`,
    );
  }

  const total = rows.reduce((sum, row) => sum + row.words, 0);

  console.log('');
  console.log(`Total body words in corpus: ${total.toLocaleString()}`);
  console.log(`Average per page: ${Math.round(total / rows.length)}`);
  console.log(
    thin > 0
      ? `\n${thin} entry(ies) below their source-data floor (platform ${MIN_WORDS.platform}, crawler ${MIN_WORDS.crawler}).`
      : `\nEvery entry is above its source-data floor (platform ${MIN_WORDS.platform}, crawler ${MIN_WORDS.crawler}).`,
  );
  console.log('Run `npm run seo:dogfood` to measure the rendered pages against the real floor.');

  if (check) {
    const thinPlatforms = rows.filter(
      (row) => row.kind === 'platform' && row.words < MIN_WORDS.platform,
    );
    if (thinPlatforms.length > 0) {
      console.error(`\nFAIL: ${thinPlatforms.length} platform page(s) below the floor.`);
      process.exitCode = 1;
    }
  }
}

main();
