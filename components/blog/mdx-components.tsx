import type { MDXComponents } from 'mdx/types';
import {
  AI_CRAWLERS,
  NON_RENDERING_CRAWLERS,
  VISIBILITY_CRITICAL_CRAWLERS,
  type AiCrawler,
  type CrawlerPurpose,
} from '@/lib/audit/crawlers';
import { AuditCta } from './AuditCta';

/**
 * Components available inside blog MDX.
 *
 * Any number a post states about the crawler landscape comes from these, not
 * from the prose: "13 of 15" written into an article is wrong the day a
 * crawler is added to the registry, and nobody re-reads old posts.
 */

type CountKind = 'total' | 'non-rendering' | 'rendering' | 'visibility' | 'training';

function countOf(kind: CountKind): number {
  switch (kind) {
    case 'total':
      return AI_CRAWLERS.length;
    case 'non-rendering':
      return NON_RENDERING_CRAWLERS.length;
    case 'rendering':
      return AI_CRAWLERS.length - NON_RENDERING_CRAWLERS.length;
    case 'visibility':
      return VISIBILITY_CRITICAL_CRAWLERS.length;
    case 'training':
      return AI_CRAWLERS.filter((crawler) => !crawler.blockingCostsVisibility).length;
  }
}

/** <CrawlerCount kind="non-rendering" /> → a number from the registry. */
export function CrawlerCount({ kind }: { kind: CountKind }) {
  return <>{countOf(kind)}</>;
}

const PURPOSE_LABEL: Record<CrawlerPurpose, string> = {
  training: 'Model training',
  'search-index': 'Search index',
  'user-agent-action': 'Fetch on user request',
};

/** <CrawlerTable purpose="training" /> — omit purpose for every crawler. */
export function CrawlerTable({ purpose }: { purpose?: CrawlerPurpose }) {
  const rows: readonly AiCrawler[] = purpose
    ? AI_CRAWLERS.filter((crawler) => crawler.purpose === purpose)
    : AI_CRAWLERS;

  return (
    <div className="not-prose my-8 surface-card overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider ink-muted">
            <th scope="col" className="border-b px-4 py-3 font-medium">User-agent token</th>
            <th scope="col" className="border-b px-4 py-3 font-medium">Operator</th>
            <th scope="col" className="border-b px-4 py-3 font-medium">Job</th>
            <th scope="col" className="border-b px-4 py-3 font-medium">Runs JavaScript</th>
            <th scope="col" className="border-b px-4 py-3 font-medium">Blocking costs visibility</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((crawler) => (
            <tr key={crawler.token}>
              <td className="border-b px-4 py-3 font-mono text-xs">
                <a href={`/ai-crawlers/${crawler.token.toLowerCase()}`} className="underline underline-offset-2">
                  {crawler.token}
                </a>
              </td>
              <td className="border-b px-4 py-3 ink-secondary">{crawler.operator}</td>
              <td className="border-b px-4 py-3 ink-secondary">{PURPOSE_LABEL[crawler.purpose]}</td>
              <td className="border-b px-4 py-3 ink-secondary">{crawler.rendersJavaScript ? 'Yes' : 'No'}</td>
              <td className="border-b px-4 py-3 ink-secondary">{crawler.blockingCostsVisibility ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A robots.txt that lets every answer-engine crawler in and keeps every
 * training crawler out, generated from the registry so it matches what the
 * scanner checks. `private` paths are disallowed for everyone.
 */
export function robotsTemplate(privatePaths: readonly string[] = ['/admin/', '/api/']): string {
  const disallow = privatePaths.map((p) => `Disallow: ${p}`);
  const lines: string[] = ['# Answer engines: allowed, so you can be found and cited'];
  for (const crawler of VISIBILITY_CRITICAL_CRAWLERS) {
    lines.push(`User-agent: ${crawler.token}`);
  }
  lines.push('Allow: /', ...disallow, '');
  const training = AI_CRAWLERS.filter((c) => !c.blockingCostsVisibility);
  lines.push('# Model training: opted out. No effect on Google Search, AI Overviews,');
  lines.push('# or ChatGPT, Claude and Perplexity search results.');
  if (training.some((c) => c.token === 'Google-Extended')) {
    // Google's docs: Google-Extended also governs grounding in Gemini Apps.
    lines.push('# Google-Extended also controls grounding in Gemini Apps and Vertex AI.');
  }
  for (const crawler of training) {
    lines.push(`User-agent: ${crawler.token}`);
  }
  lines.push('Disallow: /', '');
  lines.push('# Everyone else, including Googlebot and Bingbot');
  lines.push('User-agent: *', 'Allow: /', ...disallow, '');
  lines.push('Sitemap: https://example.com/sitemap.xml');
  return lines.join('\n');
}

export function RobotsTemplate() {
  return (
    <pre className="not-prose code-block my-6 p-4">
      <code>{robotsTemplate()}</code>
    </pre>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="not-prose my-6 rounded-xl border-l-4 px-5 py-4 text-sm leading-relaxed ink-secondary" style={{ borderColor: 'var(--accent)', background: 'var(--surface-sunken)' }}>
      {children}
    </div>
  );
}

export const blogMdxComponents: MDXComponents = {
  AuditCta,
  CrawlerCount,
  CrawlerTable,
  RobotsTemplate,
  Note,
};
