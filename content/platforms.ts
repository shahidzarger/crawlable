/**
 * Programmatic SEO corpus: one page per website platform.
 *
 * These pages target the long-tail query people actually type once they hear
 * that AI crawlers do not run JavaScript — "is Webflow good for AI search",
 * "does ChatGPT read React sites". Each entry is real, specific guidance about
 * that platform's rendering model, which is what makes the pages worth having.
 */

export type RenderingModel =
  | 'server-rendered'
  | 'static'
  | 'hybrid'
  | 'client-rendered';

export interface Platform {
  slug: string;
  name: string;
  /** How the platform serves HTML by default. */
  rendering: RenderingModel;
  /** 0-100 starting position before any tuning. */
  baselineScore: number;
  /** One-sentence verdict used as the page's lede and meta description. */
  verdict: string;
  /** The specific mechanism that helps or hurts. */
  mechanism: string;
  /** Concrete, platform-specific actions. */
  fixes: string[];
  /** Things people believe about this platform that are wrong. */
  gotchas: string[];
  /** Where llms.txt and robots.txt physically go on this platform. */
  filePlacement: string;
}

export const PLATFORMS: readonly Platform[] = [
  {
    slug: 'nextjs',
    name: 'Next.js',
    rendering: 'hybrid',
    baselineScore: 78,
    verdict:
      'Next.js is excellent for AI crawlers when you use Server Components or static generation, and invisible to them when you opt into client rendering.',
    mechanism:
      'The App Router renders Server Components to HTML on the server, so the text ships in the initial response. The moment a route is marked "use client" and fetches its data in an effect, the served HTML is an empty shell and every non-rendering crawler sees nothing.',
    fixes: [
      'Audit which routes carry "use client" at the page level — a client boundary around an interactive widget is fine, one around the whole page is not.',
      'Move data fetching into Server Components or route-level async functions rather than useEffect.',
      'Use generateStaticParams for content routes so pages are built ahead of time.',
      'Set generateMetadata per route so every page has a unique title and description in the raw HTML.',
      'Check the output of `curl -s https://yoursite.com | grep -c "your body text"` — if it is zero, the crawler sees zero too.',
    ],
    gotchas: [
      'Streaming with Suspense still ships the fallback first. Crawlers that read the full response get the streamed content, but a crawler that cuts the connection early may not.',
      'next/dynamic with ssr:false removes the component from the HTML entirely.',
      'A page that renders fine in the browser proves nothing — the browser runs the JavaScript the crawler skips.',
    ],
    filePlacement:
      'Put llms.txt in /public/llms.txt. Generate robots.txt with an app/robots.ts route, or place a static file in /public.',
  },
  {
    slug: 'react',
    name: 'React (create-react-app / Vite SPA)',
    rendering: 'client-rendered',
    baselineScore: 22,
    verdict:
      'A plain React SPA is close to invisible to AI crawlers: the served HTML is a near-empty div and everything else arrives via JavaScript they do not run.',
    mechanism:
      'A Vite or CRA build ships an index.html containing a single mount point and a script tag. The browser fills it in; GPTBot, ClaudeBot and PerplexityBot do not. They read the shell, find nothing, and index nothing.',
    fixes: [
      'Prerender the routes at build time — vite-plugin-ssr, react-snap or a headless-Chrome prerender step writes real HTML per route.',
      'For a content-heavy site, migrate the public pages to a framework that server-renders and keep React for the app behind the login.',
      'If prerendering is not possible, serve a server-rendered version to crawlers specifically. This is not cloaking as long as the content matches exactly.',
      'Verify with `curl`, never with the browser — view-source is the only view that matches what a crawler gets.',
    ],
    gotchas: [
      'react-helmet sets the title after hydration, so it never reaches a non-rendering crawler.',
      'Google can render JavaScript, which is why a site can rank in Google Search and still be absent from AI answers. The two are not the same pipeline.',
      'Adding structured data via JavaScript has the same problem — inject it server-side or not at all.',
    ],
    filePlacement:
      'Put llms.txt and robots.txt in the /public folder so they are copied to the build output root.',
  },
  {
    slug: 'wordpress',
    name: 'WordPress',
    rendering: 'server-rendered',
    baselineScore: 82,
    verdict:
      'WordPress serves complete HTML by default, which puts it near the top for AI readability — the usual problems are structured data and bot blocking, not rendering.',
    mechanism:
      'PHP renders the full page server-side, so the content is in the initial response. What tends to break AI visibility instead is an over-eager security plugin or CDN rule that blocks unfamiliar user agents, catching AI crawlers along with scrapers.',
    fixes: [
      'Check your security plugin (Wordfence, Sucuri) and CDN bot rules for blanket user-agent blocking — allow OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User and PerplexityBot explicitly.',
      'Use a schema plugin, or your SEO plugin\'s schema module, to emit Organization and Article JSON-LD.',
      'Serve llms.txt as a real file rather than a rewritten route, so it returns text/markdown rather than the theme.',
      'Turn off any "block AI crawlers" toggle unless you have decided you want that — several plugins ship it on by default now.',
    ],
    gotchas: [
      'Page builders that render content client-side (some Elementor widgets, most carousels) hide that content from crawlers even on a server-rendered site.',
      'The default WordPress robots.txt is virtual. Adding a physical file overrides it entirely, including the wp-admin disallow.',
      'Cloudflare\'s AI crawler blocking is a one-click setting that silently removes you from AI answers.',
    ],
    filePlacement:
      'Upload llms.txt and robots.txt to the web root over FTP or your host\'s file manager. A plugin-generated virtual robots.txt is overridden by a physical file.',
  },
  {
    slug: 'shopify',
    name: 'Shopify',
    rendering: 'server-rendered',
    baselineScore: 74,
    verdict:
      'Shopify serves Liquid-rendered HTML, so products are readable — but collection filtering, reviews and recommendations are usually client-side and invisible.',
    mechanism:
      'Liquid templates render on Shopify\'s servers, so the product title, description and price are in the raw HTML. The parts that sell — reviews, size guides, "customers also bought" — are almost always injected by apps after load, so an AI crawler never sees your social proof.',
    fixes: [
      'Check whether your review app renders server-side. If it does not, mirror the review summary into the product description or a metafield rendered in Liquid.',
      'Confirm Product schema includes offers, aggregateRating and availability — Shopify emits a basic block, but apps often break it.',
      'Expand thin product descriptions: one paragraph of marketing copy is not enough for a model to recommend the product over a competitor with three.',
      'Add llms.txt pointing at your main collections rather than every product URL.',
    ],
    gotchas: [
      'You cannot edit robots.txt directly in older stores; newer ones allow it via robots.txt.liquid in the theme.',
      'Shopify\'s bot protection can rate-limit crawlers on large catalogues, which shows up as fetch failures rather than blocks.',
      'Duplicate content across /products/x and /collections/y/products/x dilutes which URL gets cited — set canonicals.',
    ],
    filePlacement:
      'Edit robots.txt via Online Store → Themes → Edit code → robots.txt.liquid. llms.txt needs a redirect or an app, since Shopify does not serve arbitrary root files.',
  },
  {
    slug: 'webflow',
    name: 'Webflow',
    rendering: 'static',
    baselineScore: 80,
    verdict:
      'Webflow publishes static HTML with the content baked in, which makes it genuinely good for AI crawlers — the weak spot is CMS collection pages with thin content.',
    mechanism:
      'Webflow compiles your design to static HTML at publish time, so the text of every element is present in the response before any script runs. Interactions, animations and page transitions are layered on afterwards by Webflow\'s runtime and do not remove content from the document. The failure mode on Webflow is therefore never rendering — it is CMS collection items that carry two sentences of body copy, and pages whose real message lives inside an exported image.',
    fixes: [
      'Add JSON-LD through the page custom-code settings, per collection template rather than per item, so every item in a collection inherits it.',
      'Fill in meta descriptions in the CMS collection settings — they default to empty, and an empty field produces an empty tag rather than no tag.',
      'Watch for content inside Webflow Tabs and Sliders. It does ship in the HTML, but nested several wrappers deep, so keep the sentence that answers the page\'s question in the top-level flow instead.',
      'Expand thin CMS items. A collection template that renders a title, an image and forty words produces dozens of near-identical thin pages, which is worse for you than having fewer, deeper ones.',
      'Replace text baked into exported images with real text elements styled to match. The design survives; the words become readable.',
      'Upload llms.txt via a custom page published at the /llms.txt path, or serve it from the hosting file settings.',
    ],
    gotchas: [
      'Lottie animations and embedded iframes carry no readable text, so anything important expressed in them is invisible to every crawler, AI or otherwise.',
      'Webflow\'s default robots.txt on a webflow.io staging subdomain disallows everything. Publishing to a custom domain does not always replace it, and sites have launched with the staging rules still live.',
      'Rich-text fields authored without headings produce one undifferentiated block. Retrieval systems chunk at heading boundaries, so a 2,000-word rich-text field with no H2s becomes a single chunk that matches nothing precisely.',
      'Webflow injects its own script bundle on every page. That is harmless for readability but does lower your text-to-markup ratio, which can make an otherwise fine page look thinner than it is in automated reports.',
    ],
    filePlacement:
      'Site settings → SEO → robots.txt for crawler rules. For llms.txt, create a page at the /llms.txt path or host it on a subdomain.',
  },
  {
    slug: 'squarespace',
    name: 'Squarespace',
    rendering: 'hybrid',
    baselineScore: 62,
    verdict:
      'Squarespace serves most page content in HTML but loads galleries, summary blocks and some newer sections client-side, so parts of the page go missing for AI crawlers.',
    mechanism:
      'Core text blocks render server-side and arrive in the initial HTML. Summary blocks, gallery sections and several of the newer 7.1 layout blocks hydrate after load, which means the content they hold does not exist in the raw response at all. Because those are exactly the blocks people use for "our latest work" and "featured posts", the parts of a Squarespace site that showcase what you do are disproportionately the parts a crawler cannot see.',
    fixes: [
      'Move your key claims into plain text blocks rather than summary, gallery or list sections. A summary block is a convenience for visitors and a blind spot for crawlers.',
      'Add JSON-LD via Settings → Advanced → Code Injection for site-wide Organization schema, and per-page injection for Article or Product blocks.',
      'Write real meta descriptions per page in the page SEO panel rather than letting Squarespace generate one from the first text it finds.',
      'Add H2 subheadings inside long text blocks. The default styling encourages one continuous block, which chunks into a single undifferentiated passage.',
      'Replace text that lives inside uploaded images with real text blocks. The visual editor makes image-only pages easy to build and they contain literally nothing readable.',
    ],
    gotchas: [
      'You cannot edit robots.txt on Squarespace, so you cannot add explicit Allow groups for individual AI crawlers. Squarespace manages the file, which is fine until you need to state an intent it does not express for you.',
      'llms.txt cannot be served from the site root without a workaround, because Squarespace does not serve arbitrary files from the root path.',
      'The visual editor makes it easy to build a page entirely out of images with text baked into them. It looks finished and contains zero readable content.',
      'Blog post excerpts shown on index pages often come from a summary block, so an index that looks content-rich in the browser can be nearly empty in the HTML.',
    ],
    filePlacement:
      'robots.txt is managed by Squarespace and not editable. llms.txt requires hosting it elsewhere and pointing a subdomain at it.',
  },
  {
    slug: 'wix',
    name: 'Wix',
    rendering: 'hybrid',
    baselineScore: 58,
    verdict:
      'Wix has improved a great deal but still ships a heavily script-driven page, so raw-HTML content is thinner than what a visitor sees.',
    mechanism:
      'Wix server-renders a version of the page for crawlers, so the situation is better than it was a few years ago. But dynamic sections, Wix Stores listings and anything driven by an installed app often arrive only after hydration, and the markup Wix generates is verbose enough that the ratio of readable text to total document is very low. Even where your content is technically present, extraction is lossy: a crawler working through a byte budget spends most of it on wrappers.',
    fixes: [
      'Use Wix SEO Settings to set unique titles and descriptions per page. The defaults repeat the site name across every page, which makes pages indistinguishable at citation time.',
      'Add structured data through Wix\'s built-in schema editor rather than by injecting JSON-LD with a script — the built-in path renders server-side, the injected one may not.',
      'Keep your key copy in standard text elements rather than inside Wix apps or embedded widgets, which are the components most likely to load late.',
      'Edit robots.txt through Marketing & SEO → SEO Tools to add explicit Allow groups for the retrieval crawlers.',
      'Cut page weight where you can. A leaner page raises your text-to-markup ratio without changing a word of your copy.',
    ],
    gotchas: [
      'Wix pages are large, and a crawler working to a byte budget can truncate before reaching content that is genuinely present further down the document.',
      'Velo-powered dynamic pages can render client-side depending on how the data is bound, so two pages built in the same editor can behave differently.',
      'The Preview view shows the hydrated page. It always looks better than what a crawler receives, and it is the view most people check.',
      'Installed third-party apps frequently inject their content after load, so reviews, booking widgets and galleries added through the App Market are usually invisible even when the surrounding page is fine.',
    ],
    filePlacement:
      'Edit robots.txt under Marketing & SEO → SEO Tools → Robots.txt Editor. llms.txt needs to be uploaded as a file and routed, which Wix does not support natively.',
  },
  {
    slug: 'astro',
    name: 'Astro',
    rendering: 'static',
    baselineScore: 90,
    verdict:
      'Astro is about as good as it gets for AI readability: zero JavaScript by default means everything ships as HTML.',
    mechanism:
      'Astro renders components to HTML at build time and ships no client JavaScript unless you explicitly opt a component in with a client: directive. The raw response is the finished page, which is the ideal case for a crawler that will not run scripts. The islands architecture means the interactive parts of your page are the exception rather than the default, so the amount of content that depends on hydration is small by construction.',
    fixes: [
      'Keep client: directives on genuinely interactive islands only. A component marked client:only renders nothing at all server-side and is invisible in the HTML.',
      'Use content collections with typed frontmatter to generate per-page titles and descriptions automatically, so no page ships with a missing or duplicated tag.',
      'Add an llms.txt endpoint at src/pages/llms.txt.ts that generates the file from your content collection at build time. It then updates itself whenever you publish, which is the only way a file like this stays accurate.',
      'Emit Organization and WebSite JSON-LD in your base layout so every page inherits it, and add Article schema in the blog layout.',
      'Generate robots.txt from the same source as your sitemap at src/pages/robots.txt.ts, so the Sitemap directive can never point at a stale path.',
    ],
    gotchas: [
      'client:only renders nothing server-side. It is the one Astro directive that reliably costs you AI visibility, and it is easy to reach for when a component touches window during setup.',
      'Output mode "server" with no per-route prerendering makes behaviour depend on your adapter and cache configuration rather than on the framework, so the guarantees above no longer hold automatically.',
      'A high baseline score can make people stop checking. Astro removes the rendering problem; it does nothing about thin content, missing schema or a robots.txt that blocks retrieval crawlers.',
    ],
    filePlacement:
      'Put llms.txt and robots.txt in /public, or generate them as endpoints at src/pages/llms.txt.ts and src/pages/robots.txt.ts.',
  },
  {
    slug: 'framer',
    name: 'Framer',
    rendering: 'static',
    baselineScore: 72,
    verdict:
      'Framer publishes static HTML with text included, so it reads reasonably well — though heavy use of effects and CMS components thins out the raw content.',
    mechanism:
      'Framer generates static pages at publish time, so text placed in text layers is present in the HTML before any script runs. What does not survive is anything produced at runtime: code components that fetch their own data, and content bound to sources Framer resolves in the browser. Because Framer is a design-first tool, the other common loss is text that was never text — a headline set inside an exported graphic reads as an empty image to a crawler.',
    fixes: [
      'Prefer CMS collections over runtime fetches inside code components. Collection content is baked into the published HTML; a fetch inside a component is not.',
      'Set per-page SEO titles and descriptions in page settings rather than relying on the site-level defaults, which repeat across pages.',
      'Add Organization JSON-LD through the custom-code section in site settings, and per-page schema on templates that warrant it.',
      'Keep the sentence that explains what the page is in a text layer, not baked into an image, a vector or a video.',
      'Give long pages real heading layers rather than styling large text to look like a heading. Visual hierarchy is not document structure, and only the second one chunks.',
    ],
    gotchas: [
      'Code components calling fetch() at runtime produce no server-rendered content, so the section renders empty in the raw HTML however good it looks in the browser.',
      'Framer\'s generated markup is deeply nested, which lowers the text-to-markup ratio even when all the text is present, and can make a healthy page look thin in automated reports.',
      'Scroll-triggered effects do not hide content from crawlers — the text is in the document regardless of whether it has animated into view. This one worries people unnecessarily.',
    ],
    filePlacement:
      'Site settings → General → robots.txt. llms.txt can be added as a custom page at the /llms.txt path.',
  },
  {
    slug: 'vue-nuxt',
    name: 'Vue & Nuxt',
    rendering: 'hybrid',
    baselineScore: 70,
    verdict:
      'Nuxt with SSR on is readable; a plain Vue SPA or Nuxt with ssr:false is not.',
    mechanism:
      'Nuxt server-renders by default and produces complete HTML, which puts it in good standing. The two ways that breaks are explicit: setting ssr to false, and using plain Vue with Vite, which ships an empty #app div plus a script tag and nothing else. The subtler failure is data fetched in onMounted, which by definition runs only in the browser — the page structure server-renders, the content inside it does not.',
    fixes: [
      'Confirm ssr is true in nuxt.config, or use nuxt generate for a fully static build where every route is prerendered.',
      'Fetch with useAsyncData or useFetch rather than in onMounted, so the data resolves during server rendering and lands in the HTML.',
      'Use useHead or useSeoMeta for per-page metadata so titles and descriptions are part of the server response rather than set after hydration.',
      'Use <ClientOnly> sparingly and only around components that genuinely cannot render on the server. Everything inside it is absent from the HTML.',
      'For a plain Vue SPA, add a prerender step to the build rather than migrating everything at once. Prerendering the public marketing routes captures most of the benefit.',
    ],
    gotchas: [
      'A component wrapped in <ClientOnly> is invisible to every non-rendering crawler, including its fallback content if you did not provide one.',
      'Nuxt route rules can switch individual routes to client-side rendering from a single config block, so one line can silently change the behaviour of a whole section.',
      'Composables that touch window during setup force you toward ClientOnly, which is how sites end up with more client-only components than anyone intended.',
      'Hydration mismatches can cause Vue to discard and re-render server content in the browser. The HTML was correct, so crawlers are fine — but it makes local testing confusing.',
    ],
    filePlacement:
      'Put llms.txt and robots.txt in /public, or use the @nuxtjs/robots module for generated rules.',
  },
  {
    slug: 'angular',
    name: 'Angular',
    rendering: 'client-rendered',
    baselineScore: 25,
    verdict:
      'A default Angular application renders entirely in the browser, so AI crawlers receive an empty <app-root> and nothing else.',
    mechanism:
      'Angular bootstraps in the browser and builds the DOM from JavaScript. Without server rendering, the served HTML contains a single <app-root> element and a set of script tags — that is the entire document as far as a non-rendering crawler is concerned. Angular is disproportionately used for applications behind a login, where this does not matter, and the problem usually appears when the public marketing pages were built in the same project.',
    fixes: [
      'Enable Angular SSR. Running `ng add @angular/ssr` configures server rendering for an existing application without a rewrite.',
      'Prerender the routes whose content does not vary per request. Marketing, docs and pricing pages almost always qualify.',
      'Move Meta and Title service calls into route resolvers so they execute during server rendering rather than after the app boots.',
      'Verify with curl rather than the browser. The browser runs the JavaScript that the crawler skips, so it can only ever tell you the good news.',
      'If the public pages live in the same project as the application, consider splitting them out. A static marketing site alongside an Angular app is simpler than making the whole app render twice.',
    ],
    gotchas: [
      'Angular SSR still requires each route to be renderable without client-side state. A route that depends on something only available in the browser fails its server render and falls back to the shell, silently.',
      'TransferState avoids a duplicate fetch after hydration but does nothing for the initial HTML if SSR is off — it is a performance feature, not a visibility one.',
      'Third-party libraries that reference document or window at import time break server rendering entirely, which is the most common reason an SSR migration stalls.',
    ],
    filePlacement:
      'Put llms.txt and robots.txt in src/assets or the configured public folder so they are emitted to the build root.',
  },
  {
    slug: 'gatsby',
    name: 'Gatsby',
    rendering: 'static',
    baselineScore: 84,
    verdict:
      'Gatsby builds static HTML per route, so content is readable — the risk is components that only render after hydration.',
    mechanism:
      'Gatsby compiles every page to HTML at build time from its GraphQL data layer, so content sourced through a page query is in the response before any script runs. The exceptions are specific and worth knowing: anything fetched in useEffect, anything gated behind a window check, and any route registered as client-only. Those render nothing at build time and therefore nothing for a crawler.',
    fixes: [
      'Source content through page queries rather than runtime fetches, so it is baked into the build output.',
      'Use the Gatsby Head API for metadata so titles and descriptions are emitted at build time rather than set by the browser after load.',
      'Audit every component gated on typeof window !== "undefined". That guard is correct for avoiding build errors and also means the component contributes nothing to the HTML.',
      'Generate llms.txt from your GraphQL data in gatsby-node, so the file is rebuilt from the same source as your pages and cannot drift.',
      'Emit Organization schema from your layout and Article schema from the blog template, both at build time.',
    ],
    gotchas: [
      'Deferred Static Generation pages are built on first request, so a crawler arriving before a human may receive a placeholder rather than the page.',
      'Client-only routes defined with matchPath produce no static HTML at all — they are invisible by design, which is fine for app routes and not for content.',
      'A long build can tempt you toward client-side data fetching for freshness. That trade buys you fresher data and costs you the crawler entirely; incremental builds are the better answer.',
    ],
    filePlacement: 'Put llms.txt and robots.txt in the /static folder, which is copied to the build root.',
  },
] as const;

export function platformBySlug(slug: string): Platform | undefined {
  return PLATFORMS.find((platform) => platform.slug === slug);
}

export const RENDERING_LABEL: Record<RenderingModel, string> = {
  'server-rendered': 'Server-rendered',
  static: 'Static HTML',
  hybrid: 'Hybrid',
  'client-rendered': 'Client-rendered',
};

export const RENDERING_VERDICT: Record<RenderingModel, string> = {
  'server-rendered': 'AI crawlers can read this platform by default.',
  static: 'AI crawlers can read this platform by default.',
  hybrid: 'Readability depends on how the site is configured.',
  'client-rendered': 'AI crawlers see almost nothing by default.',
};
