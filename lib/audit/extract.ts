import * as cheerio from 'cheerio';
import type { HeadingNode, JsonLdBlock, PageAnalysis } from './types';
import { safeFetch, FetchError, normaliseUrl } from './fetcher';

/**
 * Raw-HTML analysis. Everything measured here is measured on the bytes the
 * server returns, with no JavaScript executed — which is exactly the view a
 * non-rendering AI crawler gets.
 */

/** Elements whose text is never shown to a reader. */
const NON_CONTENT_SELECTORS = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'iframe',
  'head',
].join(', ');

/** Markers that a served document is an empty single-page-app shell. */
const SPA_ROOT_IDS = [
  '#root',
  '#app',
  '#__next',
  '#__nuxt',
  '#___gatsby',
  '#svelte',
  '[data-reactroot]',
  '#main-app',
  'app-root',
];

interface FrameworkSignature {
  name: string;
  test: (html: string, $: cheerio.CheerioAPI) => boolean;
}

const FRAMEWORK_SIGNATURES: FrameworkSignature[] = [
  {
    name: 'Next.js',
    test: (html, $) => $('#__next').length > 0 || html.includes('/_next/static'),
  },
  {
    name: 'Nuxt',
    test: (html, $) => $('#__nuxt').length > 0 || html.includes('/_nuxt/'),
  },
  {
    name: 'Gatsby',
    test: (html, $) => $('#___gatsby').length > 0 || html.includes('gatsby-'),
  },
  {
    name: 'Angular',
    test: (_html, $) => $('app-root').length > 0 || $('[ng-version]').length > 0,
  },
  {
    name: 'SvelteKit',
    test: (html) => html.includes('__sveltekit') || html.includes('/_app/immutable'),
  },
  {
    name: 'Vue',
    test: (html, $) => $('#app[data-v-app]').length > 0 || html.includes('__VUE__'),
  },
  {
    name: 'Create React App',
    test: (html, $) =>
      $('#root').length > 0 && /\/static\/js\/(main|bundle)\.[\w.]+\.js/.test(html),
  },
  {
    name: 'React',
    test: (html, $) => $('[data-reactroot]').length > 0 || html.includes('__REACT_DEVTOOLS'),
  },
  {
    name: 'WordPress',
    test: (html) => html.includes('/wp-content/') || html.includes('/wp-includes/'),
  },
  {
    name: 'Shopify',
    test: (html) => html.includes('cdn.shopify.com') || html.includes('Shopify.theme'),
  },
  {
    name: 'Webflow',
    test: (html, $) => $('html[data-wf-site]').length > 0 || html.includes('webflow.js'),
  },
  {
    name: 'Squarespace',
    test: (html) => html.includes('squarespace.com/universal') || html.includes('Static.SQUARESPACE_CONTEXT'),
  },
  {
    name: 'Wix',
    test: (html) => html.includes('static.parastorage.com') || html.includes('wixBiSession'),
  },
  {
    name: 'Framer',
    test: (html) => html.includes('framerusercontent.com') || html.includes('__framer'),
  },
  {
    name: 'Astro',
    test: (html) => html.includes('astro-island') || html.includes('/_astro/'),
  },
];

export function detectFramework(html: string, $: cheerio.CheerioAPI): string | null {
  for (const signature of FRAMEWORK_SIGNATURES) {
    try {
      if (signature.test(html, $)) return signature.name;
    } catch {
      // A malformed document should never break detection.
    }
  }
  return null;
}

/** Collapse whitespace the way a reader perceives it. */
export function normaliseText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function extractVisibleText($: cheerio.CheerioAPI): string {
  const $clone = cheerio.load($.html());
  $clone(NON_CONTENT_SELECTORS).remove();
  $clone('[hidden], [aria-hidden="true"]').remove();
  return normaliseText($clone('body').text() || $clone.root().text());
}

export function extractHeadings($: cheerio.CheerioAPI): HeadingNode[] {
  const headings: HeadingNode[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_, element) => {
    const tag = (element as { tagName?: string }).tagName ?? 'h6';
    const level = Number.parseInt(tag.slice(1), 10);
    const text = normaliseText($(element).text());
    if (text) headings.push({ level, text: text.slice(0, 200) });
  });
  return headings.slice(0, 200);
}

function collectSchemaTypes(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaTypes(item, into);
    return;
  }
  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  const type = record['@type'];
  if (typeof type === 'string') into.add(type);
  else if (Array.isArray(type)) {
    for (const t of type) if (typeof t === 'string') into.add(t);
  }

  for (const key of Object.keys(record)) {
    if (key === '@type') continue;
    collectSchemaTypes(record[key], into);
  }
}

export function extractJsonLd($: cheerio.CheerioAPI): {
  blocks: JsonLdBlock[];
  types: string[];
} {
  const blocks: JsonLdBlock[] = [];
  const allTypes = new Set<string>();

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;

    const block: JsonLdBlock = {
      raw: raw.slice(0, 8_000),
      valid: false,
      types: [],
    };

    try {
      const parsed: unknown = JSON.parse(raw);
      const types = new Set<string>();
      collectSchemaTypes(parsed, types);
      block.valid = true;
      block.types = [...types];
      for (const t of types) allTypes.add(t);
    } catch (error) {
      block.error = error instanceof Error ? error.message : 'Invalid JSON';
    }

    blocks.push(block);
  });

  return { blocks: blocks.slice(0, 25), types: [...allTypes] };
}

export interface SpaVerdict {
  isSpaShell: boolean;
  signals: string[];
}

/**
 * Decide whether the served HTML is an unhydrated shell.
 *
 * No single signal is conclusive — a short landing page is not an SPA, and a
 * heavy marketing page can legitimately carry a low text ratio. The verdict
 * requires a genuinely thin document plus corroborating structural evidence.
 */
export function detectSpaShell(
  $: cheerio.CheerioAPI,
  html: string,
  wordCount: number,
  textToHtmlRatio: number,
): SpaVerdict {
  const signals: string[] = [];

  /*
   * An empty framework mount point is the one near-conclusive signal: a
   * document that declares #root or #__next and puts nothing inside it is a
   * shell waiting for hydration, not a page. Everything else is circumstantial
   * and only counts in combination, because a genuinely short page — an about
   * page, a contact page — is short without being broken.
   */
  const emptyRoot = SPA_ROOT_IDS.some((selector) => {
    const node = $(selector);
    if (node.length === 0) return false;
    return countWords(normaliseText(node.text())) < 10;
  });
  if (emptyRoot) {
    signals.push(
      'A framework mount point (#root, #app, #__next or similar) is empty in the raw HTML.',
    );
  }

  const scriptCount = $('script[src]').length;
  if (scriptCount >= 3 && wordCount < 120) {
    signals.push(
      `${scriptCount} external scripts are loaded but only ${wordCount} words are present before JavaScript runs.`,
    );
  }

  if (textToHtmlRatio < 0.03 && wordCount < 200) {
    signals.push(
      `Visible text is ${(textToHtmlRatio * 100).toFixed(1)}% of the document — the page is almost entirely markup and script.`,
    );
  }

  const noscriptRequiresJs =
    $('noscript').length > 0 && /enable\s+javascript|requires\s+javascript/i.test(html);
  if (noscriptRequiresJs) {
    signals.push('A <noscript> block tells visitors the page requires JavaScript to work.');
  }

  if ($('body').children().length <= 3 && wordCount < 50) {
    signals.push('The <body> contains almost no elements before hydration.');
  }

  /*
   * A bundled application shell looks different from a short hand-written
   * page. Requiring some evidence of a JavaScript application before the weak
   * signals count is what keeps a 40-word contact page out of this bucket:
   * that page is thin, and the thin-content check will say so, but it is not a
   * shell and telling a customer otherwise would be wrong.
   */
  const hasBundleScripts =
    scriptCount >= 2 ||
    $('script[src]').toArray().some((element) => {
      const src = $(element).attr('src') ?? '';
      return /_next\/|\/chunk|chunk\.|bundle|runtime|\/assets\/index-|main\.[0-9a-f]{6,}\.js/i.test(
        src,
      );
    });

  const applicationEvidence = emptyRoot || noscriptRequiresJs || hasBundleScripts;

  const isSpaShell =
    // An empty framework mount point on a page with no meaningful text.
    (emptyRoot && wordCount < 200) ||
    // A near-empty document that is demonstrably a JavaScript application.
    (applicationEvidence && wordCount < 100 && signals.length >= 2);

  return { isSpaShell, signals };
}

export function parseHtml(html: string): cheerio.CheerioAPI {
  return cheerio.load(html);
}

/** Analyse already-fetched HTML. Split out so it can be unit-tested offline. */
export function analyseHtml(params: {
  url: string;
  html: string;
  status: number;
  bytes: number;
  fetchMs: number;
  contentType: string;
  xRobotsTag?: string;
}): PageAnalysis {
  const { url, html, status, bytes, fetchMs, contentType, xRobotsTag } = params;
  const $ = parseHtml(html);

  const visibleText = extractVisibleText($);
  const rawWordCount = countWords(visibleText);
  const htmlBytes = bytes > 0 ? bytes : Buffer.byteLength(html);
  const textToHtmlRatio =
    htmlBytes > 0 ? Buffer.byteLength(visibleText) / htmlBytes : 0;

  const { blocks: jsonLd, types: schemaTypes } = extractJsonLd($);
  const headings = extractHeadings($);
  const { isSpaShell, signals } = detectSpaShell($, html, rawWordCount, textToHtmlRatio);

  const metaRobots = ($('meta[name="robots"]').attr('content') ?? '').toLowerCase();
  const headerRobots = (xRobotsTag ?? '').toLowerCase();
  const noindex = metaRobots.includes('noindex') || headerRobots.includes('noindex');

  let internalLinks = 0;
  let externalLinks = 0;
  let origin = '';
  try {
    origin = new URL(url).origin;
  } catch {
    origin = '';
  }

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href || href.startsWith('#')) return;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return;
    try {
      const resolved = new URL(href, url);
      if (origin && resolved.origin === origin) internalLinks += 1;
      else externalLinks += 1;
    } catch {
      // Unparseable href, ignored.
    }
  });

  let imagesMissingAlt = 0;
  const imageCount = $('img').length;
  $('img').each((_, element) => {
    const alt = $(element).attr('alt');
    if (alt === undefined || alt.trim() === '') imagesMissingAlt += 1;
  });

  const title = normaliseText($('title').first().text()) || null;
  const metaDescription =
    normaliseText($('meta[name="description"]').attr('content') ?? '') || null;
  const canonical = $('link[rel="canonical"]').attr('href') ?? null;

  return {
    url,
    status,
    fetchMs,
    contentType,
    bytes: htmlBytes,
    rawTextLength: visibleText.length,
    rawWordCount,
    textToHtmlRatio,
    isSpaShell,
    spaSignals: signals,
    framework: detectFramework(html, $),
    title,
    metaDescription,
    canonical,
    headings,
    h1Count: headings.filter((h) => h.level === 1).length,
    jsonLd,
    schemaTypes,
    internalLinks,
    externalLinks,
    imagesMissingAlt,
    imageCount,
    noindex,
    error: null,
  };
}

/** Build the analysis object used when a page could not be fetched at all. */
export function failedPage(url: string, message: string, status = 0): PageAnalysis {
  return {
    url,
    status,
    fetchMs: 0,
    contentType: '',
    bytes: 0,
    rawTextLength: 0,
    rawWordCount: 0,
    textToHtmlRatio: 0,
    isSpaShell: false,
    spaSignals: [],
    framework: null,
    title: null,
    metaDescription: null,
    canonical: null,
    headings: [],
    h1Count: 0,
    jsonLd: [],
    schemaTypes: [],
    internalLinks: 0,
    externalLinks: 0,
    imagesMissingAlt: 0,
    imageCount: 0,
    noindex: false,
    error: message,
  };
}

/** Fetch a single page and analyse it exactly as a non-rendering crawler would. */
export async function analysePage(url: string): Promise<PageAnalysis> {
  try {
    const target = normaliseUrl(url);
    const response = await safeFetch(target);

    if (response.status >= 400) {
      return failedPage(url, `Server returned HTTP ${response.status}.`, response.status);
    }

    return analyseHtml({
      url: response.finalUrl,
      html: response.body,
      status: response.status,
      bytes: response.bytes,
      fetchMs: response.fetchMs,
      contentType: response.headers['content-type'] ?? '',
      xRobotsTag: response.headers['x-robots-tag'],
    });
  } catch (error) {
    const message =
      error instanceof FetchError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Unknown error.';
    return failedPage(url, message);
  }
}
