/**
 * Crawl ceilings, in a module with no dependencies.
 *
 * Separate from lib/audit/index.ts so a Client Component can import the page
 * cap without pulling the crawler — and with it node:dns and node:net — into
 * the browser bundle. lib/audit/index.ts re-exports these, so server callers
 * are unaffected.
 */
export const PAGE_LIMITS = {
  /** A single-page scan: the standard free tier. */
  scan: 1,
  /** The technical ceiling on any one audit, paid or beta. */
  audit: 40,
} as const;
