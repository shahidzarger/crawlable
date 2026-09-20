/**
 * Editorial depth for the per-crawler pages.
 *
 * Kept out of lib/audit/crawlers.ts on purpose: that file is the operational
 * registry the audit engine depends on, and it should stay small and factual.
 * This file is marketing content, and each entry has to earn its page with
 * something specific — a consequence, a configuration detail, a mistake people
 * actually make with this particular bot. Generic filler repeated fifteen times
 * would be exactly the thin duplicate content the product warns against.
 */

export interface CrawlerNote {
  /** What actually happens to you when this crawler is blocked. */
  consequence: string;
  /** How to confirm a request claiming this user agent is genuine. */
  verification: string;
  /** The specific mistake people make with this crawler. */
  commonMistake: string;
}

export const CRAWLER_NOTES: Record<string, CrawlerNote> = {
  GPTBot: {
    consequence:
      'Your content stops being collected for future OpenAI model training. Nothing changes about how you appear in ChatGPT today, because ChatGPT answers about current events are retrieved live, not recalled from training. This is the crawler people block when they mean "do not train on my work", and blocking it for that reason is coherent.',
    verification:
      'OpenAI publishes the IP ranges its crawlers operate from as JSON files on its own domain. Check a request\'s source IP against that list before trusting the user agent string — the string itself is trivially spoofable and commonly is, by scrapers hoping your firewall has an allow rule for it.',
    commonMistake:
      'Blocking GPTBot and assuming that removes you from ChatGPT. It does not. If that was your goal you blocked the wrong bot, and if it was not your goal you may have given up training-data inclusion for nothing.',
  },
  'OAI-SearchBot': {
    consequence:
      'You are removed from the index that ChatGPT search draws on. When a user asks a question your page answers, your page is not a candidate. There is no partial version of this: an unindexed page is not ranked low, it is absent.',
    verification:
      'OpenAI publishes a separate IP range file for the search crawler, distinct from the GPTBot list. Verify against that one specifically — the ranges are not interchangeable.',
    commonMistake:
      'Copying a "block AI scrapers" robots.txt snippet from a blog post. Most of those snippets were written when GPTBot was the only OpenAI crawler and now sweep up the search crawler alongside it, quietly removing the site from ChatGPT search.',
  },
  'ChatGPT-User': {
    consequence:
      'When a person pastes your URL into ChatGPT and asks what it says, the fetch is refused and the assistant tells them it cannot access the page. This is the most visible failure mode of any crawler on this list, because a real person is watching it happen in real time.',
    verification:
      'OpenAI publishes IP ranges for user-initiated fetches separately from both the training and search crawlers. These requests are one-off and driven by a human action, so they arrive in ones and twos rather than as a sustained crawl.',
    commonMistake:
      'Treating this as a scraper and rate-limiting it. It is not crawling you; it is a person asking about your page. Rate limits tuned for bulk crawlers routinely catch it on the first request.',
  },
  ClaudeBot: {
    consequence:
      'Your content is not collected for Anthropic model training. As with GPTBot, this is a content-licensing position rather than a visibility one, and it has no bearing on whether Claude can read your page when a user asks about it.',
    verification:
      'Anthropic publishes the IP ranges its crawlers use. Verify the source address rather than the user agent; ClaudeBot is among the more frequently spoofed strings precisely because sites allow-list it.',
    commonMistake:
      'Blocking ClaudeBot along with Claude-User and Claude-SearchBot in one rule group. They are three different bots doing three different jobs, and only the first is about training.',
  },
  'Claude-SearchBot': {
    consequence:
      'Your pages stop being indexed as sources Claude can cite. The effect is the same shape as blocking any search index crawler: you are not down-ranked, you are simply not in the candidate set.',
    verification:
      'Check the source IP against Anthropic\'s published ranges. The search crawler is distinct from ClaudeBot and should be evaluated on its own, not by assuming one Anthropic range covers all of them.',
    commonMistake:
      'Assuming a wildcard Allow covers it. It does, until someone adds a blanket Disallow for an unrelated reason — a staging leak, a scraper problem — and the search crawler goes down with everything else because it was never named.',
  },
  'Claude-User': {
    consequence:
      'A user who shares your link with Claude gets told the page could not be fetched. If your business involves people sharing your documentation, pricing or research with an assistant, this is a direct loss.',
    verification:
      'Verify against Anthropic\'s published IP ranges. Like other user-action fetchers, it produces sporadic single requests rather than a crawl pattern, so traffic-shape heuristics tend to misread it.',
    commonMistake:
      'Bot-protection services classifying it as an unknown automated client and serving a challenge page. The challenge is what gets read, and the answer describes your CAPTCHA rather than your product.',
  },
  PerplexityBot: {
    consequence:
      'You lose Perplexity citations entirely. Perplexity surfaces sources prominently next to its answers, so being in that index is unusually visible compared with other answer engines — and being absent is unusually invisible.',
    verification:
      'Perplexity publishes IP ranges for its crawler. Verification matters more here than most: Perplexity\'s crawling practices have been publicly disputed, so if you care about the distinction between declared and undeclared fetching, checking source IPs is the only way to know which you are seeing.',
    commonMistake:
      'Blocking it in response to reporting about undeclared crawling. Blocking the declared crawler removes you from citations while doing nothing about undeclared traffic, which by definition does not announce itself in your robots.txt.',
  },
  'Perplexity-User': {
    consequence:
      'When someone opens your link from within Perplexity or asks about it directly, the page cannot be read. The user sees a failure rather than your content.',
    verification:
      'Check the source IP against Perplexity\'s published ranges. As a user-action fetcher, it arrives as individual requests triggered by a person, not as a scheduled crawl.',
    commonMistake:
      'Grouping it with PerplexityBot in a single Disallow. The indexing crawler and the user fetcher serve different moments in the same journey, and blocking both closes the loop twice.',
  },
  'Google-Extended': {
    consequence:
      'Your content stops being used for Gemini model training and for grounding in Google\'s generative products. Your Google Search ranking is entirely unaffected — this token does not touch Search at all.',
    verification:
      'Google-Extended is not a crawler with its own user agent making requests. It is a robots.txt token that controls how content already fetched by Google\'s standard crawlers may be used. There is no request to verify, which makes it unique on this list.',
    commonMistake:
      'Expecting to see Google-Extended in your server logs. You will not, because nothing requests pages under that name. People spend real time trying to confirm it is working by looking for traffic that does not exist.',
  },
  'Applebot-Extended': {
    consequence:
      'Your content is excluded from Apple foundation model training. Applebot itself continues to crawl for Siri and Spotlight, so your presence in Apple\'s search surfaces is unchanged.',
    verification:
      'Like Google-Extended, this is a usage-control token rather than a distinct crawler. Applebot proper can be verified by reverse DNS to an Apple-controlled hostname and a matching forward lookup.',
    commonMistake:
      'Blocking Applebot rather than Applebot-Extended when the intent was to opt out of training. That removes you from Siri and Spotlight results, which is almost never what was wanted.',
  },
  Amazonbot: {
    consequence:
      'You are excluded from Amazon\'s answer and assistant surfaces, including Alexa responses that draw on web content. For most sites this is a smaller audience than the OpenAI and Anthropic surfaces, but for consumer product and recipe content it is not.',
    verification:
      'Amazon documents reverse-DNS verification for Amazonbot: the source IP should resolve to an Amazon-controlled hostname, and the forward lookup of that hostname should return the same IP.',
    commonMistake:
      'Confusing Amazonbot with the various Amazon advertising and affiliate crawlers, which are separate user agents with separate purposes and separate robots.txt handling.',
  },
  Bytespider: {
    consequence:
      'Your content is not collected for ByteDance model training. There is no user-facing answer surface tied to this crawler that blocking would remove you from.',
    verification:
      'Bytespider is among the most commonly spoofed user agent strings on the web, so a request claiming to be Bytespider very often is not. If you see sustained aggressive traffic under this name, check the source IPs before concluding anything about who is sending it.',
    commonMistake:
      'Blocking it in robots.txt and expecting the traffic to stop. Robots.txt is a request, not a control; the reason Bytespider appears on so many block lists is its crawl rate, and a crawl rate problem is solved at the firewall or CDN, not in a text file.',
  },
  'meta-externalagent': {
    consequence:
      'Your content is not collected for Meta AI model training. Meta\'s assistant surfaces that rely on live retrieval are governed separately, so this is a training-data decision.',
    verification:
      'Meta publishes IP ranges for its crawling infrastructure. Verify against those; the user agent string alone tells you nothing you should act on.',
    commonMistake:
      'Blocking only the older Meta crawler token and assuming coverage. Meta has used more than one name for this function over time, and an outdated robots.txt entry names a bot that no longer visits.',
  },
  'cohere-ai': {
    consequence:
      'Your content is excluded from Cohere\'s training data collection. Cohere sells models to enterprises rather than running a consumer answer engine, so there is no citation surface at stake.',
    verification:
      'Cohere\'s crawler is comparatively low-volume. If you are seeing high request rates under this name, treat the user agent as unverified and check the source addresses.',
    commonMistake:
      'Leaving it out of a robots.txt that otherwise names every AI crawler. If your position on training data is a policy, it should be stated consistently, including for the vendors with no consumer product.',
  },
  'MistralAI-User': {
    consequence:
      'A Le Chat user who shares your URL gets a fetch failure instead of your content. As with other user-action fetchers, the loss is immediate and visible to a person.',
    verification:
      'This is a user-triggered fetcher, so requests arrive individually in response to a human action rather than as a crawl. Check source IPs against Mistral\'s published infrastructure rather than trusting the string.',
    commonMistake:
      'Omitting it from an allow list built around the American AI companies. European users reaching your content through a European assistant are still users.',
  },
};

export function crawlerNote(token: string): CrawlerNote | undefined {
  return CRAWLER_NOTES[token];
}
