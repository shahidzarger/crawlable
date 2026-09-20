import { tryFetch } from './fetcher';
import type { LlmsTxtAnalysis } from './types';

/**
 * llms.txt checking.
 *
 * The spec is a markdown file at the site root: an H1 with the project name, an
 * optional blockquote summary, then H2 sections of annotated links. Google says
 * it does not use the file; Anthropic and OpenAI both publish and recommend one
 * for agent workflows. It is cheap to ship and only ever helps agents, so the
 * audit treats a missing file as a warning rather than a failure.
 */

export function validateLlmsTxt(raw: string): {
  wellFormed: boolean;
  issues: string[];
  linkCount: number;
} {
  const issues: string[] = [];
  const lines = raw.split(/\r?\n/);

  const firstMeaningful = lines.find((line) => line.trim().length > 0) ?? '';
  if (!/^#\s+\S/.test(firstMeaningful.trim())) {
    issues.push('The file should open with a single H1 naming the site or project.');
  }

  const h1Count = lines.filter((line) => /^#\s+\S/.test(line.trim())).length;
  if (h1Count > 1) {
    issues.push(`Found ${h1Count} H1 headings. The spec expects exactly one.`);
  }

  const hasSummary = lines.some((line) => line.trim().startsWith('>'));
  if (!hasSummary) {
    issues.push('No blockquote summary. A one-paragraph "> summary" tells an agent what the site is.');
  }

  const hasSections = lines.some((line) => /^##\s+\S/.test(line.trim()));
  if (!hasSections) {
    issues.push('No H2 sections. Group links under headings such as "## Docs" or "## Products".');
  }

  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links = [...raw.matchAll(linkPattern)];
  const linkCount = links.length;

  if (linkCount === 0) {
    issues.push('No markdown links found. The file is only useful if it points at real pages.');
  }

  const relativeLinks = links.filter((match) => {
    const href = match[2] ?? '';
    return !/^https?:\/\//i.test(href);
  });
  if (relativeLinks.length > 0) {
    issues.push(
      `${relativeLinks.length} link(s) are relative. Agents fetch this file out of context, so use absolute URLs.`,
    );
  }

  const annotated = links.filter((match) => {
    const index = match.index ?? 0;
    const rest = raw.slice(index + match[0].length, index + match[0].length + 4);
    return rest.trimStart().startsWith(':');
  });
  if (linkCount > 0 && annotated.length === 0) {
    issues.push('Links have no descriptions. Add "- [Title](url): what this page covers".');
  }

  return { wellFormed: issues.length === 0, issues, linkCount };
}

export async function analyseLlmsTxt(origin: string): Promise<LlmsTxtAnalysis> {
  const url = new URL('/llms.txt', origin).toString();
  const response = await tryFetch(url, { allowAnyContentType: true });

  if (!response || response.status !== 200) {
    return {
      found: false,
      url,
      status: response?.status ?? null,
      raw: null,
      wellFormed: false,
      issues: [],
      linkCount: 0,
    };
  }

  // Many hosts serve the SPA index for any unknown path. That is not a file.
  if (/^\s*<(?:!doctype|html)/i.test(response.body)) {
    return {
      found: false,
      url,
      status: response.status,
      raw: null,
      wellFormed: false,
      issues: ['The server returned HTML instead of a markdown file.'],
      linkCount: 0,
    };
  }

  const { wellFormed, issues, linkCount } = validateLlmsTxt(response.body);

  return {
    found: true,
    url,
    status: response.status,
    raw: response.body.slice(0, 20_000),
    wellFormed,
    issues,
    linkCount,
  };
}
