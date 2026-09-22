# Crawlable

**See what AI crawlers actually read on your site — and get the files that fix it.**

Most AI crawlers do not execute JavaScript. GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot,
Claude-SearchBot, PerplexityBot and the rest fetch raw HTML and parse it. If your content
arrives after hydration, it does not exist as far as they are concerned — and nothing in your
existing toolchain tells you, because your browser, your analytics and Googlebot all render
JavaScript before they look.

Crawlable measures exactly how much of a site they can read, then generates the `llms.txt`,
`robots.txt` and JSON-LD to fix what it finds.

---

## What it does

| | |
| --- | --- |
| **Free scan** | One page, no signup. Raw-HTML readability, robots.txt policy across 15 AI crawlers, llms.txt check. |
| **Paid audit** | Up to 40 pages sampled across the sitemap, plus four generated fix files. |
| **Output** | `FIXES.md`, `llms.txt`, `robots.txt`, `schema.jsonld` — built from the crawl, not from a template. |

### The seven checks

| Dimension | Weight | What it measures |
| --- | ---: | --- |
| Raw-HTML readability | 35% | Empty framework shells, readable word count, text-to-markup ratio |
| AI crawler policy | 25% | Per-crawler robots.txt verdict, separating retrieval bots from training bots |
| Content structure | 15% | H1 presence, subheading density, heading-level gaps — how well the page chunks |
| Structured data | 12% | JSON-LD coverage, validity, Organization schema |
| Page metadata | 8% | Titles, descriptions, duplicates, noindex directives |
| llms.txt | 5% | Presence and conformance to the spec |
| Crawl health | — | Fetch failures and slow responses (reported, folded into the others) |

Raw-HTML readability carries the most weight because nothing else helps a crawler that cannot
read the page at all.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # optional — the app runs with nothing set
npm run dev
```

Open <http://localhost:3000> and scan a real domain. With no environment variables the app
uses an in-memory store, disables checkout and skips email; `/api/health` reports exactly
which subsystems are degraded.

```bash
npm run typecheck      # tsc --noEmit
npm test               # 96 unit tests
npm run build          # production build, 37 pages
npm run seo:report     # programmatic SEO corpus coverage
npm run seo:dogfood    # audit our own pages with our own engine (needs the server running)
```

---

## Deployment

### 1. Database

Any Postgres 13+ instance — Neon, Supabase, Vercel Postgres, RDS.

```bash
DATABASE_URL=postgres://... npm run db:migrate
```

The migration is idempotent and the app also applies it lazily on first use, so this step is
optional but worth doing before traffic arrives. If your provider uses a transaction-mode
pooler (PgBouncer, Supabase on port 6543), use the pooled URL — the driver is configured with
`prepare: false` for exactly that case.

**Without `DATABASE_URL` the app still runs**, on an in-memory store that is wiped on every
cold start. `/api/health` returns a warning when that happens in production. Do not ship that
way: licenses and audit history will not survive.

### 2. Lemon Squeezy

Lemon Squeezy is the merchant of record, so it handles global VAT and sales tax and issues the
license keys. This app never sees a card detail and never generates a key itself.

1. Create a store, then three products:
   - **Single Audit** — one-time, $39
   - **Growth Pack** — one-time, $89
   - **Agency Pro** — subscription, $29/month
2. Enable license keys on all three (Product → Licensing). Set the activation limit to
   unlimited; Crawlable meters usage itself against the plan catalogue.
3. Collect the IDs into your environment:
   - Settings → API → new API key → `LEMONSQUEEZY_API_KEY`
   - Settings → Stores → store ID → `LEMONSQUEEZY_STORE_ID`
   - Each product → Variants → variant ID → `LEMONSQUEEZY_VARIANT_SINGLE` / `_PACK` / `_AGENCY`
4. Settings → Webhooks → new webhook:
   - **URL** `https://YOUR-DOMAIN/api/webhooks/lemonsqueezy`
   - **Events** `order_created`, `license_key_created`, `subscription_created`,
     `subscription_updated`, `subscription_cancelled`, `subscription_expired`
   - Signing secret → `LEMONSQUEEZY_WEBHOOK_SECRET`

### 3. Email

Verify your sending domain in Resend first, then set `RESEND_API_KEY` and `EMAIL_FROM`. An
unverified domain puts purchase receipts — which carry the license key — into spam.

Email failures never fail a purchase or an audit. They are logged and the request succeeds.

### 4. Deploy

```bash
vercel --prod
```

`vercel.json` sets function durations (300s for the audit route, 60s for the scan), the daily
cron for the unused-license nudge, and the `text/markdown` content type for `/llms.txt`.

Set `CRON_SECRET` to a random 32-byte hex string (`openssl rand -hex 32`). The nudge endpoint
**refuses to run** when it is unset rather than defaulting open — an unauthenticated endpoint
that sends email is a spam cannon.

### 5. Verify

```bash
curl https://YOUR-DOMAIN/api/health
npm run seo:dogfood -- https://YOUR-DOMAIN
```

The health endpoint returns 200 only when the store is reachable, and lists warnings for an
in-memory store in production, unconfigured payments and disabled email.

---

## Architecture

```
lib/audit/          The engine. No framework dependencies, fully unit-tested.
  crawlers.ts       Registry of 15 AI crawlers: operator, purpose, JS rendering, blocking cost
  fetcher.ts        Hardened fetch: SSRF guards, size caps, timeouts, redirect re-validation
  extract.ts        Raw-HTML analysis, SPA-shell detection, framework fingerprinting
  robots.ts         robots.txt parser with real longest-match precedence rules
  llmstxt.ts        llms.txt discovery and spec conformance
  discover.ts       Sitemap parsing, homepage fallback, even sampling, bounded concurrency
  scoring.ts        Seven weighted checks producing findings, not just numbers
  generators.ts     The paid deliverable: llms.txt, robots.txt, JSON-LD, FIXES.md
  index.ts          Orchestration

lib/db/             Store interface with Postgres and in-memory adapters
lib/lemonsqueezy.ts Checkout creation, webhook signature verification, license validation
lib/licensing.ts    Entitlement mapping and atomic credit accounting
lib/email/          Resend delivery plus four transactional templates

app/api/            scan · audit · audit/[id] · audit/[id]/download · checkout
                    webhooks/lemonsqueezy · license · health · cron/nudge
app/platforms/      12 programmatic SEO pages, statically generated
app/ai-crawlers/    15 programmatic SEO pages, statically generated
content/            Editorial corpus, separate from the operational registry
scripts/            db migration · social queue runner · SEO reports
```

### Design decisions worth knowing

**No accounts.** The Lemon Squeezy license key *is* the credential. Keys are stored as SHA-256
hashes, never plaintext, so a database leak yields nothing usable. A customer who arrives
before the webhook lands is provisioned on the spot by validating against the Lemon Squeezy
License API, so a race never turns away someone who paid.

**Credits are spent before the crawl and refunded on failure.** Spending first means two
concurrent audits cannot both slip through on the last credit; the Postgres implementation
uses a single conditional `UPDATE` for the same reason. If the crawl throws before producing a
result, the credit goes back.

**Quotas come from the plan catalogue, not the webhook.** A malformed or replayed webhook
cannot grant more credits than a plan sells.

**Webhooks verify before parsing.** The raw body is read as text, the HMAC is compared in
constant time, and only a verified body is acted on. Handlers are idempotent because Lemon
Squeezy retries any non-2xx, and a redelivered order must not reset used credits or resend a
key.

**Every user-supplied URL is treated as hostile.** Private, loopback, link-local, CGNAT and
multicast ranges are refused in both IPv4 and IPv6, including IPv4-mapped forms; the host is
re-checked after every redirect hop; responses are capped at 3 MB with a 12-second timeout.
The cloud metadata address specifically is covered by tests.

**Report URLs are v4 UUIDs.** That makes a report link an unguessable capability, so a
customer can share findings with a client without either party needing an account. Generated
files stay gated on the license that owns the audit.

**The SPA heuristic requires corroboration.** An empty framework mount point is near-conclusive;
everything else only counts alongside evidence of a bundled application. This is deliberate —
a 40-word contact page is thin, and the thin-content check says so, but it is not a shell, and
telling a paying customer their working site is broken would be worse than missing an edge case.
`tests/extract.test.ts` pins both directions.

**The site passes its own audit.** `npm run seo:dogfood` runs the analyser over all 30 public
pages and fails if any comes back as a shell or below the thin-content floor. A tool that tells
people to serve readable HTML has to serve readable HTML.

---

## Distribution

`scripts/social/content.json` holds a value-first post queue — every post teaches the mechanism
before it mentions the product.

```bash
npm run social:queue -- --dry-run     # preview what is due
npm run social:queue                  # publish due posts
npm run social:queue -- --id=<postId> # publish one now
```

Supports X, LinkedIn and Reddit. Credentials come from the environment; a channel with missing
credentials is skipped with an explanation rather than failing the run. Published IDs are
recorded in `scripts/social/.published.json` so re-running is safe.

The 27 programmatic pages under `/platforms` and `/ai-crawlers` are the compounding channel:
each targets a long-tail query someone types after hearing that AI crawlers do not run
JavaScript, and each ends at the free scan.

---

## Security notes

- No secret is ever hardcoded. Every secret is declared in `lib/env.ts`, validated lazily with
  Zod, and read through that module only. The one exception is deliberate: static metadata
  modules (`app/sitemap.ts`, `app/robots.ts`, page `generateMetadata`) read the public
  `NEXT_PUBLIC_SITE_URL` directly, because they are evaluated at build time where a throwing
  validator would break the build. Nothing secret is read that way.
- License keys are hashed with SHA-256 before storage. Only the last four characters are ever
  displayed.
- Webhook signatures are compared with `timingSafeEqual`.
- Scan and checkout endpoints are rate-limited per IP through the store.
- `/dashboard`, `/audit/*` and `/api/*` are disallowed in our own robots.txt and marked
  `noindex`.

## License

Proprietary. All rights reserved.
