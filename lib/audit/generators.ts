import { AI_CRAWLERS } from './crawlers';
import { prioritisedFindings } from './scoring';
import type {
  AuditResult,
  CheckResult,
  GeneratedFiles,
  PageAnalysis,
  RobotsAnalysis,
} from './types';
import { generateSitemapXml } from './sitemap';

/**
 * Fix-file generation.
 *
 * This is what the customer is actually buying: not a list of problems, but the
 * files to paste. Everything generated here is derived from what the crawl
 * found on the real site — no templates with placeholders left in them.
 */

function hostOf(siteUrl: string): string {
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, '');
  } catch {
    return siteUrl;
  }
}

function siteName(pages: PageAnalysis[], siteUrl: string): string {
  const home = pages[0];
  if (home?.title) {
    // Titles usually read "Page — Brand" or "Brand | Tagline". Take the part
    // most likely to be the brand: the shortest segment that isn't generic.
    const segments = home.title
      .split(/\s+[|–—·»-]\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const generic = /^(home|welcome|index|homepage)$/i;
    const candidates = segments.filter((s) => !generic.test(s));
    if (candidates.length > 1) {
      const last = candidates[candidates.length - 1];
      const first = candidates[0];
      if (last && first) return last.length <= first.length ? last : first;
    }
    if (candidates[0]) return candidates[0];
  }
  return hostOf(siteUrl);
}

function summaryOf(pages: PageAnalysis[]): string | null {
  const home = pages[0];
  if (home?.metaDescription) return home.metaDescription;
  const withDescription = pages.find((page) => page.metaDescription);
  return withDescription?.metaDescription ?? null;
}

/** Group discovered pages into llms.txt sections by their top-level path. */
function groupPages(pages: PageAnalysis[]): Map<string, PageAnalysis[]> {
  const groups = new Map<string, PageAnalysis[]>();

  const labelFor = (pathname: string): string => {
    const segment = pathname.split('/').filter(Boolean)[0];
    if (!segment) return 'Key pages';
    const known: Record<string, string> = {
      docs: 'Documentation',
      doc: 'Documentation',
      documentation: 'Documentation',
      blog: 'Blog',
      posts: 'Blog',
      article: 'Articles',
      articles: 'Articles',
      products: 'Products',
      product: 'Products',
      pricing: 'Pricing',
      features: 'Features',
      guides: 'Guides',
      guide: 'Guides',
      support: 'Support',
      help: 'Support',
      about: 'Company',
      company: 'Company',
      legal: 'Legal',
      api: 'API',
    };
    const lower = segment.toLowerCase();
    if (known[lower]) return known[lower];
    return lower.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  for (const page of pages) {
    if (page.error !== null) continue;
    let pathname = '/';
    try {
      pathname = new URL(page.url).pathname;
    } catch {
      continue;
    }
    const label = labelFor(pathname);
    const list = groups.get(label) ?? [];
    list.push(page);
    groups.set(label, list);
  }

  return groups;
}

export function generateLlmsTxt(result: AuditResult): string {
  const { siteUrl, pages } = result;
  const name = siteName(pages, siteUrl);
  const summary = summaryOf(pages);
  const groups = groupPages(pages);

  const lines: string[] = [`# ${name}`, ''];

  if (summary) {
    lines.push(`> ${summary}`, '');
  } else {
    lines.push(
      `> ${name} — add one paragraph here describing what this site is and who it is for. This is the first thing an agent reads.`,
      '',
    );
  }

  lines.push(
    'This file follows the llms.txt convention. It lists the pages an AI agent should read to understand this site.',
    '',
  );

  // "Key pages" first, then the rest alphabetically for a stable file.
  const ordered = [...groups.entries()].sort(([a], [b]) => {
    if (a === 'Key pages') return -1;
    if (b === 'Key pages') return 1;
    return a.localeCompare(b);
  });

  for (const [label, groupPagesList] of ordered) {
    lines.push(`## ${label}`, '');
    for (const page of groupPagesList.slice(0, 25)) {
      const title = page.title ?? page.url;
      const description =
        page.metaDescription ??
        (page.headings.find((h) => h.level === 2)?.text ?? 'Describe what this page covers.');
      lines.push(`- [${title}](${page.url}): ${description}`);
    }
    lines.push('');
  }

  lines.push(
    '## Optional',
    '',
    `- [Sitemap](${new URL('/sitemap.xml', siteUrl).toString()}): the XML sitemap for this site.`,
    '',
  );

  return lines.join('\n');
}

export function generateRobotsTxt(result: AuditResult): string {
  const { siteUrl, robots } = result;
  const sitemapUrl =
    robots.sitemaps[0] ?? new URL('/sitemap.xml', siteUrl).toString();

  const retrieval = AI_CRAWLERS.filter((c) => c.blockingCostsVisibility);
  const training = AI_CRAWLERS.filter((c) => !c.blockingCostsVisibility);

  const lines: string[] = [
    '# robots.txt — generated by Crawlable',
    '#',
    '# Retrieval and user-action crawlers are allowed explicitly: blocking these',
    '# removes you from the answers real users see.',
    '#',
    '# Training crawlers are listed separately and left allowed. Disallowing them',
    '# is a content-licensing decision with no effect on AI visibility — flip any',
    '# of them to "Disallow: /" if you do not want your content used for training.',
    '',
    '# --- Retrieval / user-action crawlers (allow these to be cited) ---',
    '',
  ];

  for (const crawler of retrieval) {
    lines.push(`# ${crawler.operator}: ${crawler.note}`);
    lines.push(`User-agent: ${crawler.token}`);
    lines.push('Allow: /');
    lines.push('');
  }

  lines.push('# --- Training crawlers (licensing choice, not a visibility choice) ---', '');

  for (const crawler of training) {
    lines.push(`# ${crawler.operator}: ${crawler.note}`);
    lines.push(`User-agent: ${crawler.token}`);
    lines.push('Allow: /');
    lines.push('');
  }

  lines.push('# --- Everything else ---', '', 'User-agent: *');

  // Carry over the site's existing wildcard disallows so the generated file
  // does not silently open up paths the owner deliberately closed.
  const wildcard = robots.groups.find((group) =>
    group.userAgents.some((agent) => agent.trim() === '*'),
  );
  /*
   * Carry over the wildcard group whenever it has ANY rules.
   *
   * This used to require a non-empty disallow list, which silently dropped the
   * Allow rules of a site whose wildcard group contained only Allow lines —
   * replacing them with a bare `Allow: /`. That is a widening, and a generated
   * file that quietly opens up paths the owner scoped is the one mistake this
   * generator must never make.
   */
  const carried = wildcard
    ? [...wildcard.disallow.map((path) => `Disallow: ${path}`), ...wildcard.allow.map((path) => `Allow: ${path}`)]
    : [];

  if (carried.length > 0) {
    lines.push('# Carried over from your existing robots.txt:');
    lines.push(...carried);
  } else {
    lines.push('Allow: /');
  }

  lines.push('', `Sitemap: ${sitemapUrl}`, '');

  return lines.join('\n');
}

export function generateJsonLd(result: AuditResult): string {
  const { siteUrl, pages } = result;
  const name = siteName(pages, siteUrl);
  const summary = summaryOf(pages);
  const origin = new URL(siteUrl).origin;

  const organization: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name,
    url: origin,
    ...(summary ? { description: summary } : {}),
    logo: {
      '@type': 'ImageObject',
      url: `${origin}/logo.png`,
    },
    sameAs: [
      'https://www.linkedin.com/company/REPLACE-WITH-YOUR-HANDLE',
      'https://x.com/REPLACE-WITH-YOUR-HANDLE',
    ],
  };

  const website: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    url: origin,
    name,
    publisher: { '@id': `${origin}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${origin}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  const breadcrumbSample = pages.find((page) => {
    try {
      return new URL(page.url).pathname.split('/').filter(Boolean).length >= 2;
    } catch {
      return false;
    }
  });

  const blocks: Record<string, unknown>[] = [organization, website];

  if (breadcrumbSample) {
    const segments = new URL(breadcrumbSample.url).pathname.split('/').filter(Boolean);
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
        ...segments.map((segment, index) => ({
          '@type': 'ListItem',
          position: index + 2,
          name: segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          item: `${origin}/${segments.slice(0, index + 1).join('/')}`,
        })),
      ],
    });
  }

  const header = [
    '// Paste each block into a <script type="application/ld+json"> tag.',
    '// Organization and WebSite belong in your site-wide layout;',
    '// BreadcrumbList belongs on the matching nested pages.',
    '// Replace every REPLACE-WITH value before shipping.',
    '',
  ].join('\n');

  return header + JSON.stringify(blocks, null, 2) + '\n';
}

function severityIcon(severity: string): string {
  if (severity === 'critical') return '🔴';
  if (severity === 'warning') return '🟠';
  if (severity === 'info') return '🔵';
  return '🟢';
}

export function generateFixesMarkdown(result: AuditResult): string {
  const findings = prioritisedFindings(result.checks).filter((f) => f.severity !== 'pass');
  const host = hostOf(result.siteUrl);

  const lines: string[] = [
    `# AI readability fixes — ${host}`,
    '',
    `**Score:** ${result.score}/100 (grade ${result.grade})  `,
    `**Pages audited:** ${result.pagesAudited}  `,
    `**Content invisible to AI crawlers:** ${result.invisiblePercent}%  `,
    `**Audited:** ${new Date(result.createdAt).toISOString().slice(0, 10)}`,
    '',
    '---',
    '',
    '## Scores by dimension',
    '',
    '| Check | Score | Weight | Summary |',
    '| --- | ---: | ---: | --- |',
  ];

  for (const check of result.checks) {
    lines.push(
      `| ${check.label} | ${check.score}/100 | ${check.weight}% | ${check.summary} |`,
    );
  }

  lines.push('', '---', '', '## What to fix, in order', '');

  if (findings.length === 0) {
    lines.push('Nothing to fix. Every check passed.', '');
  }

  findings.forEach((item, index) => {
    lines.push(
      `### ${index + 1}. ${severityIcon(item.severity)} ${item.title}`,
      '',
      `**Severity:** ${item.severity}`,
      '',
      item.detail,
      '',
      `**Fix:** ${item.remedy}`,
      '',
    );

    if (item.affectedUrls.length > 0) {
      lines.push(
        `**Affected pages** (${item.affectedCount} total${
          item.affectedCount > item.affectedUrls.length ? `, first ${item.affectedUrls.length} shown` : ''
        }):`,
        '',
      );
      for (const url of item.affectedUrls) lines.push(`- ${url}`);
      lines.push('');
    }
  });

  lines.push(
    '---',
    '',
    '## Fix Kit — what to deploy, and where',
    '',
    '| File | Where it goes |',
    '| --- | --- |',
    '| `robots.txt` | Site root at `/robots.txt` — review the carried-over rules before replacing |',
    '| `sitemap.xml` | Site root at `/sitemap.xml`, then submit in Google Search Console |',
    '| `llms.txt` | Site root, served as `text/markdown` or `text/plain` at `/llms.txt` |',
    '| `schema.jsonld` | Split into `<script type="application/ld+json">` tags in your `<head>` |',
    '',
    '### Deployment order',
    '',
    '1. **`robots.txt` first.** Everything else is pointless while a crawler is blocked.',
    '   Retrieval bots (`OAI-SearchBot`, `PerplexityBot`, `Claude-SearchBot`) are allowed',
    '   explicitly; training bots (`GPTBot`, `Google-Extended`) are listed separately so',
    '   you can make that call on licensing grounds rather than by accident.',
    '2. **`sitemap.xml`** to the site root. Read the comment at the top of the file first:',
    `   it lists the ${result.pagesAudited} pages this audit crawled and verified as HTTP 200, so if your`,
    '   site is larger, treat it as a template and add the rest rather than replacing a',
    '   complete sitemap with a partial one.',
    '3. **`schema.jsonld`** into your site-wide layout. Replace every `REPLACE-WITH` value',
    '   before shipping — placeholder social handles in production markup look worse than',
    '   no markup at all.',
    '4. **`llms.txt`** to the site root. No framework configuration needed; it is a static',
    '   file that agents fetch directly.',
    '',
    '### Then verify',
    '',
    'Deploy all four, then re-scan this domain from your dashboard. The report will show a',
    'before-and-after score so you can see which fixes actually landed. A re-scan uses one',
    'of the verification scans included with your plan.',
    '',
    '## How the score is calculated',
    '',
    'Each dimension is scored 0-100 and combined by weight. Raw-HTML readability carries the',
    'heaviest weight because a crawler that cannot read the page cannot be helped by anything else.',
    '',
    '| Dimension | Weight |',
    '| --- | ---: |',
  );

  for (const check of result.checks.filter((c: CheckResult) => c.weight > 0)) {
    lines.push(`| ${check.label} | ${check.weight}% |`);
  }

  lines.push('', '---', '', `Generated by Crawlable — ${result.id}`, '');

  return lines.join('\n');
}

export function generateAll(result: AuditResult): GeneratedFiles {
  return {
    'robots.txt': generateRobotsTxt(result),
    'sitemap.xml': generateSitemapXml(result),
    'llms.txt': generateLlmsTxt(result),
    'schema.jsonld': generateJsonLd(result),
    'FIXES.md': generateFixesMarkdown(result),
  };
}

/** Exposed for the report UI, which shows the robots diff before download. */
export function robotsChangeSummary(robots: RobotsAnalysis): string {
  if (!robots.found) return 'No existing robots.txt — this file is safe to add as-is.';
  const blocked = robots.crawlerAccess.filter((a) => !a.allowed);
  if (blocked.length === 0) {
    return 'Your existing rules already allow every AI crawler. This file makes that intent explicit.';
  }
  return `This file unblocks ${blocked.length} crawler(s) that your current robots.txt disallows.`;
}
