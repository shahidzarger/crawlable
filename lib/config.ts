import { PAGE_LIMITS } from '@/lib/audit/types-limits';

/**
 * Launch-window feature flags.
 *
 * Read from NEXT_PUBLIC_* directly rather than through lib/env.ts, which is
 * the same exception lib/checkout-links.ts makes: Next inlines a
 * NEXT_PUBLIC_ variable at build time only when it appears as a literal
 * member expression, so it cannot be routed through a Zod-validated server
 * function and still reach the browser.
 *
 * Off is the default and the safe state. Absent, misspelt or set to anything
 * other than 'true' means standard behaviour — a flag that fails open would
 * be a flag that gives the product away on a typo.
 */

/**
 * Public beta: any visitor may run a full multi-page audit for free.
 *
 * What this flag does NOT change is the paid boundary. The Fix Kit still
 * requires a licence, is still never generated for an anonymous audit, and
 * the download route still refuses a report no licence owns. The flag widens
 * the diagnostic, not the deliverable — which is what makes it safe to flip
 * back with one variable.
 */
export function betaFreeDeepAudit(): boolean {
  return process.env.NEXT_PUBLIC_BETA_FREE_DEEP_AUDIT === 'true';
}

/**
 * Pages a visitor with no licence may crawl in one run.
 *
 * The 40-page ceiling is the same technical cap a paid audit uses; beta does
 * not raise it, it only removes the licence requirement.
 */
export function freeAuditPageLimit(): number {
  return betaFreeDeepAudit() ? PAGE_LIMITS.audit : PAGE_LIMITS.scan;
}

/**
 * Anonymous runs allowed per IP per hour.
 *
 * Deliberately lower in beta than the single-page limit it replaces. Eight
 * one-page scans is eight requests to somebody else's server; eight 40-page
 * crawls is three hundred and twenty, and the target is a domain the caller
 * types in. At that point a free endpoint is a traffic amplifier pointed at
 * third parties, so the deep-audit allowance is tighter even though each run
 * is worth more.
 */
export function freeAuditRateLimit(): { limit: number; windowSeconds: number } {
  return betaFreeDeepAudit()
    ? { limit: 3, windowSeconds: 3600 }
    : { limit: 8, windowSeconds: 3600 };
}
