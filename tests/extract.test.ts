import { describe, expect, it } from 'vitest';
import {
  analyseHtml,
  countWords,
  detectFramework,
  detectSpaShell,
  extractJsonLd,
  extractVisibleText,
  parseHtml,
} from '@/lib/audit/extract';

/** An unhydrated Next.js shell — the case the whole product exists to catch. */
const SPA_SHELL = `<!doctype html>
<html lang="en">
  <head>
    <title>Home</title>
    <script src="/_next/static/chunks/main.js" defer></script>
    <script src="/_next/static/chunks/framework.js" defer></script>
    <script src="/_next/static/chunks/pages.js" defer></script>
  </head>
  <body>
    <div id="__next"></div>
    <noscript>You need to enable JavaScript to run this app.</noscript>
  </body>
</html>`;

const SERVER_RENDERED = `<!doctype html>
<html lang="en">
  <head>
    <title>Pricing — Acme</title>
    <meta name="description" content="Transparent pricing for Acme.">
    <link rel="canonical" href="https://acme.test/pricing">
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Organization","name":"Acme","url":"https://acme.test"}
    </script>
  </head>
  <body>
    <h1>Pricing</h1>
    <p>${'Acme charges a flat monthly fee with no per-seat pricing and no annual lock-in. '.repeat(
      12,
    )}</p>
    <h2>What is included</h2>
    <p>${'Every plan includes unlimited projects, unlimited collaborators and priority support. '.repeat(
      12,
    )}</p>
    <a href="https://acme.test/docs">Docs</a>
    <a href="https://external.test">External</a>
    <img src="/a.png" alt="Screenshot">
    <img src="/b.png">
    <style>body { color: red; }</style>
    <script>console.log('not content');</script>
  </body>
</html>`;

describe('extractVisibleText', () => {
  it('excludes script and style content', () => {
    const text = extractVisibleText(parseHtml(SERVER_RENDERED));
    expect(text).toContain('Acme charges a flat monthly fee');
    expect(text).not.toContain('not content');
    expect(text).not.toContain('color: red');
  });

  it('returns almost nothing for an SPA shell', () => {
    const text = extractVisibleText(parseHtml(SPA_SHELL));
    expect(countWords(text)).toBeLessThan(20);
  });
});

describe('detectSpaShell', () => {
  it('flags an empty framework mount point', () => {
    const $ = parseHtml(SPA_SHELL);
    const text = extractVisibleText($);
    const verdict = detectSpaShell($, SPA_SHELL, countWords(text), 0.01);

    expect(verdict.isSpaShell).toBe(true);
    expect(verdict.signals.length).toBeGreaterThan(0);
  });

  it('does not flag a server-rendered page', () => {
    const $ = parseHtml(SERVER_RENDERED);
    const text = extractVisibleText($);
    const words = countWords(text);
    const ratio = Buffer.byteLength(text) / Buffer.byteLength(SERVER_RENDERED);
    const verdict = detectSpaShell($, SERVER_RENDERED, words, ratio);

    expect(verdict.isSpaShell).toBe(false);
  });

  it('does not flag a short but genuine page on one weak signal alone', () => {
    const html = `<!doctype html><html><body><h1>About</h1><p>${'We build tools. '.repeat(
      40,
    )}</p></body></html>`;
    const $ = parseHtml(html);
    const words = countWords(extractVisibleText($));
    const verdict = detectSpaShell($, html, words, 0.4);

    expect(verdict.isSpaShell).toBe(false);
  });
});

describe('detectFramework', () => {
  it('identifies Next.js from the mount point', () => {
    expect(detectFramework(SPA_SHELL, parseHtml(SPA_SHELL))).toBe('Next.js');
  });

  it('identifies WordPress from asset paths', () => {
    const html = '<html><body><link href="/wp-content/themes/x/style.css"></body></html>';
    expect(detectFramework(html, parseHtml(html))).toBe('WordPress');
  });

  it('returns null when nothing matches', () => {
    const html = '<html><body><p>Plain</p></body></html>';
    expect(detectFramework(html, parseHtml(html))).toBeNull();
  });
});

describe('extractJsonLd', () => {
  it('parses valid blocks and collects nested types', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Article","publisher":{"@type":"Organization","name":"Acme"}}
      </script>
    </head><body></body></html>`;

    const { blocks, types } = extractJsonLd(parseHtml(html));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.valid).toBe(true);
    expect(types.sort()).toEqual(['Article', 'Organization']);
  });

  it('marks malformed JSON invalid without throwing', () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type": "Article",}</script>
    </head><body></body></html>`;

    const { blocks } = extractJsonLd(parseHtml(html));
    expect(blocks[0]?.valid).toBe(false);
    expect(blocks[0]?.error).toBeTruthy();
  });
});

describe('analyseHtml', () => {
  it('measures a server-rendered page correctly', () => {
    const page = analyseHtml({
      url: 'https://acme.test/pricing',
      html: SERVER_RENDERED,
      status: 200,
      bytes: Buffer.byteLength(SERVER_RENDERED),
      fetchMs: 120,
      contentType: 'text/html',
    });

    expect(page.isSpaShell).toBe(false);
    expect(page.rawWordCount).toBeGreaterThan(200);
    expect(page.title).toBe('Pricing — Acme');
    expect(page.metaDescription).toBe('Transparent pricing for Acme.');
    expect(page.canonical).toBe('https://acme.test/pricing');
    expect(page.h1Count).toBe(1);
    expect(page.schemaTypes).toContain('Organization');
    expect(page.internalLinks).toBe(1);
    expect(page.externalLinks).toBe(1);
    expect(page.imageCount).toBe(2);
    expect(page.imagesMissingAlt).toBe(1);
    expect(page.noindex).toBe(false);
    expect(page.error).toBeNull();
  });

  it('flags an SPA shell as unreadable', () => {
    const page = analyseHtml({
      url: 'https://spa.test/',
      html: SPA_SHELL,
      status: 200,
      bytes: Buffer.byteLength(SPA_SHELL),
      fetchMs: 90,
      contentType: 'text/html',
    });

    expect(page.isSpaShell).toBe(true);
    expect(page.framework).toBe('Next.js');
    expect(page.rawWordCount).toBeLessThan(30);
  });

  it('detects noindex from the X-Robots-Tag header', () => {
    const page = analyseHtml({
      url: 'https://acme.test/hidden',
      html: '<html><body><h1>Hidden</h1></body></html>',
      status: 200,
      bytes: 100,
      fetchMs: 10,
      contentType: 'text/html',
      xRobotsTag: 'noindex, nofollow',
    });

    expect(page.noindex).toBe(true);
  });

  it('detects noindex from a meta tag', () => {
    const page = analyseHtml({
      url: 'https://acme.test/hidden',
      html: '<html><head><meta name="robots" content="NOINDEX"></head><body></body></html>',
      status: 200,
      bytes: 100,
      fetchMs: 10,
      contentType: 'text/html',
    });

    expect(page.noindex).toBe(true);
  });
});

describe('detectSpaShell — false-positive guards', () => {
  /**
   * These are the shapes that a naive heuristic misclassifies: real pages that
   * are simply short, image-heavy or script-heavy. Getting these wrong would
   * tell a paying customer their working site is broken.
   */

  it('does not flag a short contact page with a few elements', () => {
    const html = `<!doctype html><html><body>
      <h1>Contact</h1>
      <p>${'Email us at hello@example.com and we will reply within a day. '.repeat(3)}</p>
      <address>1 Example Street</address>
    </body></html>`;
    const $ = parseHtml(html);
    const words = countWords(extractVisibleText($));
    const ratio = Buffer.byteLength(extractVisibleText($)) / Buffer.byteLength(html);

    expect(detectSpaShell($, html, words, ratio).isSpaShell).toBe(false);
  });

  it('does not flag a server-rendered page that also loads many scripts', () => {
    const scripts = Array.from(
      { length: 8 },
      (_, i) => `<script src="/vendor-${i}.js"></script>`,
    ).join('');
    const html = `<!doctype html><html><head>${scripts}</head><body>
      <h1>Guide</h1>
      <p>${'This guide explains how the system works in practical detail. '.repeat(30)}</p>
    </body></html>`;
    const $ = parseHtml(html);
    const words = countWords(extractVisibleText($));
    const ratio = Buffer.byteLength(extractVisibleText($)) / Buffer.byteLength(html);

    expect(detectSpaShell($, html, words, ratio).isSpaShell).toBe(false);
  });

  it('still flags a Create React App shell', () => {
    const html = `<!doctype html><html><head>
      <script src="/static/js/main.9f2a1c.js"></script>
      <script src="/static/js/2.chunk.js"></script>
      <script src="/static/js/runtime.js"></script>
    </head><body>
      <noscript>You need to enable JavaScript to run this app.</noscript>
      <div id="root"></div>
    </body></html>`;
    const $ = parseHtml(html);
    const words = countWords(extractVisibleText($));

    const verdict = detectSpaShell($, html, words, 0.02);
    expect(verdict.isSpaShell).toBe(true);
    expect(verdict.signals.length).toBeGreaterThanOrEqual(2);
  });

  it('still flags an Angular shell', () => {
    const html = `<!doctype html><html><body>
      <app-root></app-root>
      <script src="/main.js"></script>
    </body></html>`;
    const $ = parseHtml(html);
    const words = countWords(extractVisibleText($));

    expect(detectSpaShell($, html, words, 0.01).isSpaShell).toBe(true);
  });
});
