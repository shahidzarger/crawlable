/**
 * The AI crawler registry.
 *
 * Every entry is a user-agent token that a major AI system publishes for its
 * crawler. These are the tokens site owners must reason about in robots.txt.
 *
 * `rendersJavaScript` is the single most important field in this file: with the
 * exception of Google's infrastructure, AI crawlers fetch raw HTML and do not
 * execute client-side JavaScript. Content that only exists after hydration is
 * invisible to them.
 */

export type CrawlerPurpose = 'training' | 'search-index' | 'user-agent-action';

export interface AiCrawler {
  /** Exact token as it appears in a User-agent: line. Case-insensitive at match time. */
  token: string;
  /** Display name for reports. */
  name: string;
  /** Which company operates it. */
  operator: string;
  /** What the crawler is used for. */
  purpose: CrawlerPurpose;
  /** Whether the crawler executes client-side JavaScript before reading content. */
  rendersJavaScript: boolean;
  /**
   * Whether blocking this crawler removes you from a surface users actually
   * see. Blocking a training bot costs you nothing in visibility; blocking a
   * live-retrieval bot removes you from answers.
   */
  blockingCostsVisibility: boolean;
  /** One-line explanation used in the generated report. */
  note: string;
}

export const AI_CRAWLERS: readonly AiCrawler[] = [
  {
    token: 'GPTBot',
    name: 'GPTBot',
    operator: 'OpenAI',
    purpose: 'training',
    rendersJavaScript: false,
    blockingCostsVisibility: false,
    note: 'Collects content for OpenAI model training. Blocking it does not remove you from ChatGPT answers.',
  },
  {
    token: 'OAI-SearchBot',
    name: 'OAI-SearchBot',
    operator: 'OpenAI',
    purpose: 'search-index',
    rendersJavaScript: false,
    blockingCostsVisibility: true,
    note: 'Builds the index behind ChatGPT search results. Blocking it removes you from ChatGPT search.',
  },
  {
    token: 'ChatGPT-User',
    name: 'ChatGPT-User',
    operator: 'OpenAI',
    purpose: 'user-agent-action',
    rendersJavaScript: false,
    blockingCostsVisibility: true,
    note: 'Fetches a page when a ChatGPT user follows or asks about a specific link.',
  },
  {
    token: 'ClaudeBot',
    name: 'ClaudeBot',
    operator: 'Anthropic',
    purpose: 'training',
    rendersJavaScript: false,
    blockingCostsVisibility: false,
    note: 'Collects content for Anthropic model training.',
  },
  {
    token: 'Claude-SearchBot',
    name: 'Claude-SearchBot',
    operator: 'Anthropic',
    purpose: 'search-index',
    rendersJavaScript: false,
    blockingCostsVisibility: true,
    note: 'Indexes pages to support Claude search results.',
  },
  {
    token: 'Claude-User',
    name: 'Claude-User',
    operator: 'Anthropic',
    purpose: 'user-agent-action',
    rendersJavaScript: false,
    blockingCostsVisibility: true,
    note: 'Fetches a page on behalf of a Claude user following a link.',
  },
  {
    token: 'PerplexityBot',
    name: 'PerplexityBot',
    operator: 'Perplexity',
    purpose: 'search-index',
    rendersJavaScript: false,
    blockingCostsVisibility: true,
    note: 'Builds the Perplexity index. Blocking it removes you from Perplexity citations.',
  },
  {
    token: 'Perplexity-User',
    name: 'Perplexity-User',
    operator: 'Perplexity',
    purpose: 'user-agent-action',
    rendersJavaScript: false,
    blockingCostsVisibility: true,
    note: 'Fetches a page when a Perplexity user opens or asks about a specific link.',
  },
  {
    token: 'Google-Extended',
    name: 'Google-Extended',
    operator: 'Google',
    purpose: 'training',
    rendersJavaScript: true,
    blockingCostsVisibility: false,
    note: 'Controls use of your content for Gemini training. Does not affect Google Search ranking.',
  },
  {
    token: 'Applebot-Extended',
    name: 'Applebot-Extended',
    operator: 'Apple',
    purpose: 'training',
    rendersJavaScript: true,
    blockingCostsVisibility: false,
    note: 'Controls use of your content for Apple foundation model training.',
  },
  {
    token: 'Amazonbot',
    name: 'Amazonbot',
    operator: 'Amazon',
    purpose: 'search-index',
    rendersJavaScript: false,
    blockingCostsVisibility: true,
    note: 'Feeds Alexa and Amazon answer surfaces.',
  },
  {
    token: 'Bytespider',
    name: 'Bytespider',
    operator: 'ByteDance',
    purpose: 'training',
    rendersJavaScript: false,
    blockingCostsVisibility: false,
    note: 'Collects content for ByteDance model training. Widely blocked for aggressive crawl rates.',
  },
  {
    token: 'meta-externalagent',
    name: 'Meta External Agent',
    operator: 'Meta',
    purpose: 'training',
    rendersJavaScript: false,
    blockingCostsVisibility: false,
    note: 'Collects content for Meta AI model training.',
  },
  {
    token: 'cohere-ai',
    name: 'Cohere',
    operator: 'Cohere',
    purpose: 'training',
    rendersJavaScript: false,
    blockingCostsVisibility: false,
    note: 'Collects content for Cohere model training.',
  },
  {
    token: 'MistralAI-User',
    name: 'MistralAI-User',
    operator: 'Mistral',
    purpose: 'user-agent-action',
    rendersJavaScript: false,
    blockingCostsVisibility: true,
    note: 'Fetches a page on behalf of a Le Chat user.',
  },
] as const;

/**
 * The crawlers that matter for visibility. Blocking any of these removes you
 * from a surface real users look at, which is the finding that moves buyers.
 */
export const VISIBILITY_CRITICAL_CRAWLERS: readonly AiCrawler[] =
  AI_CRAWLERS.filter((c) => c.blockingCostsVisibility);

/** Crawlers that cannot see JavaScript-rendered content. */
export const NON_RENDERING_CRAWLERS: readonly AiCrawler[] = AI_CRAWLERS.filter(
  (c) => !c.rendersJavaScript,
);

export function findCrawler(token: string): AiCrawler | undefined {
  const needle = token.trim().toLowerCase();
  return AI_CRAWLERS.find((c) => c.token.toLowerCase() === needle);
}
