import type { AiCrawler } from './crawlers';

export type Severity = 'critical' | 'warning' | 'info' | 'pass';

export type CheckId =
  | 'js-rendering'
  | 'robots-ai-policy'
  | 'structured-data'
  | 'content-structure'
  | 'llms-txt'
  | 'metadata'
  | 'crawl-health';

export interface Finding {
  id: string;
  checkId: CheckId;
  severity: Severity;
  title: string;
  /** Plain-language explanation of what was measured and why it matters. */
  detail: string;
  /** What to do about it. Empty for passing findings. */
  remedy: string;
  /** Pages this finding applies to, capped for report size. */
  affectedUrls: string[];
  /** Total affected count, which may exceed affectedUrls.length. */
  affectedCount: number;
}

export interface CheckResult {
  id: CheckId;
  label: string;
  /** 0-100 for this individual dimension. */
  score: number;
  /** Relative weight in the overall score. */
  weight: number;
  summary: string;
  findings: Finding[];
}

export interface JsonLdBlock {
  raw: string;
  valid: boolean;
  types: string[];
  error?: string;
}

export interface HeadingNode {
  level: number;
  text: string;
}

export interface PageAnalysis {
  url: string;
  status: number;
  /** Time to fetch in milliseconds. */
  fetchMs: number;
  contentType: string;
  /** Total bytes of the raw HTML response. */
  bytes: number;
  /** Visible text extracted from raw HTML, with scripts and styles removed. */
  rawTextLength: number;
  rawWordCount: number;
  /** Ratio of visible text bytes to total HTML bytes. Low means markup-heavy. */
  textToHtmlRatio: number;
  /** True when the served HTML looks like an unhydrated SPA shell. */
  isSpaShell: boolean;
  /** Evidence collected for the SPA-shell determination. */
  spaSignals: string[];
  /** Detected front-end framework, when identifiable. */
  framework: string | null;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  headings: HeadingNode[];
  h1Count: number;
  jsonLd: JsonLdBlock[];
  /** Schema.org @type values found across all JSON-LD blocks. */
  schemaTypes: string[];
  internalLinks: number;
  externalLinks: number;
  imagesMissingAlt: number;
  imageCount: number;
  /** True when a <meta name="robots"> or X-Robots-Tag forbids indexing. */
  noindex: boolean;
  /** Set when the page could not be fetched or parsed. */
  error: string | null;
}

export interface RobotsRuleGroup {
  userAgents: string[];
  allow: string[];
  disallow: string[];
  crawlDelay: number | null;
}

export interface RobotsAnalysis {
  found: boolean;
  url: string;
  status: number | null;
  raw: string | null;
  groups: RobotsRuleGroup[];
  sitemaps: string[];
  /** Per-crawler verdict for the site root. */
  crawlerAccess: CrawlerAccess[];
  error: string | null;
}

export interface CrawlerAccess {
  crawler: AiCrawler;
  /** Whether the crawler is permitted to fetch the site root. */
  allowed: boolean;
  /** True when a rule names this crawler explicitly rather than falling back to `*`. */
  explicit: boolean;
  /** The matched rule, for evidence in the report. */
  matchedRule: string | null;
}

export interface LlmsTxtAnalysis {
  found: boolean;
  url: string;
  status: number | null;
  raw: string | null;
  /** Whether the file follows the spec's H1 + blockquote + sectioned-links shape. */
  wellFormed: boolean;
  issues: string[];
  linkCount: number;
}

export interface AuditInput {
  /** Origin under audit, normalised to scheme + host. */
  siteUrl: string;
  /** Maximum number of pages to fetch. */
  maxPages: number;
  /** Whether this is the free single-page scan. */
  mode: 'scan' | 'audit';
}

export interface AuditResult {
  id: string;
  siteUrl: string;
  mode: 'scan' | 'audit';
  createdAt: string;
  /** Milliseconds spent running the audit. */
  durationMs: number;
  /** 0-100 overall AI-readability score. */
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  /**
   * The headline number: the share of audited pages whose primary content an
   * AI crawler cannot read. This is what gets shared.
   */
  invisiblePercent: number;
  pagesAudited: number;
  pagesFailed: number;
  checks: CheckResult[];
  pages: PageAnalysis[];
  robots: RobotsAnalysis;
  llmsTxt: LlmsTxtAnalysis;
  /** Generated fix files, keyed by filename. Only present for paid audits. */
  generated?: GeneratedFiles;
}

export interface GeneratedFiles {
  'llms.txt': string;
  'robots.txt': string;
  'schema.jsonld': string;
  'FIXES.md': string;
}

export interface AuditSummary {
  id: string;
  siteUrl: string;
  mode: 'scan' | 'audit';
  createdAt: string;
  score: number;
  grade: AuditResult['grade'];
  invisiblePercent: number;
  pagesAudited: number;
}
