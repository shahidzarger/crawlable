export interface Faq {
  question: string;
  answer: string;
}

/**
 * FAQ content. Also emitted as FAQPage JSON-LD on the homepage, which is both
 * good practice and a small demonstration of what the product recommends.
 */
export const FAQS: readonly Faq[] = [
  {
    question: 'Is it really true that AI crawlers do not run JavaScript?',
    answer:
      'For most of them, yes. Google\'s crawlers render JavaScript, and Google-Extended and Applebot-Extended inherit that infrastructure. GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot and the rest fetch raw HTML and parse it. That is why a site can rank perfectly well in Google Search and still be absent from AI answers: the two pipelines do not see the same page.',
  },
  {
    question: 'How is this different from Profound, Peec or Otterly?',
    answer:
      'Those tools monitor what AI systems say about your brand across a set of prompts, billed monthly. Crawlable measures whether AI systems can read your site at all, and generates the files to fix it, billed once. They answer different questions, and this one comes first — prompt monitoring on a site a crawler cannot read tells you only that you are absent.',
  },
  {
    question: 'Does llms.txt actually do anything?',
    answer:
      'It depends who you ask, and the audit is honest about that. Google has publicly said llms.txt does not help with its AI features. Anthropic and OpenAI both publish llms.txt files for their own developer sites and recommend them for agent workflows, and Perplexity has been observed using them. It is one small file, it can only help the agent case, and it carries no risk — so the audit flags a missing one as a warning rather than a failure, and generates it for you either way.',
  },
  {
    question: 'What does the free scan include?',
    answer:
      'One page of your choice, fetched as a non-rendering crawler, plus your robots.txt and llms.txt. You get the real score, the real findings and the real per-page numbers. What it does not include is the multi-page crawl and the generated fix files.',
  },
  {
    question: 'How many pages does a paid audit cover?',
    answer:
      'Up to 40, sampled across your sitemap so the audit covers your homepage, docs, product and blog rather than 40 near-identical URLs from one section. On most sites that is enough to tell you everything a full crawl would about AI readability, because rendering problems are template-level, not page-level.',
  },
  {
    question: 'Will the crawl hurt my site?',
    answer:
      'No. It is at most 40 GET requests at four concurrent connections, with a polite user agent and a per-request timeout. That is a fraction of what a single search engine crawl does in an hour.',
  },
  {
    question: 'Can I put my own branding on the report?',
    answer:
      'On the Agency plan, yes — set your name and brand colour once and every report you generate carries them. The one-time plans produce Crawlable-branded reports, which are still shareable by link with no login required.',
  },
  {
    question: 'Who handles payment and tax?',
    answer:
      'Lemon Squeezy, acting as merchant of record. That means they are the seller of record on your invoice and they handle VAT and sales tax in whichever country you are in. Crawlable never sees or stores a card detail, and your license key is stored hashed.',
  },
  {
    question: 'What if the audit finds nothing wrong?',
    answer:
      'Then you have confirmation, which is worth something, and a generated llms.txt and robots.txt you did not have before. Sites built on Astro, Gatsby, WordPress and well-configured Next.js often score in the 80s and 90s. The audit is only surprising when it is bad.',
  },
] as const;
