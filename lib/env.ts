import { z } from 'zod';
import { resolveSiteUrl } from '@/lib/site-url';

/**
 * Environment access.
 *
 * Nothing in this codebase reads process.env directly. Every secret is declared
 * here, validated lazily at first use, and never logged. Validation is lazy so
 * that `next build` succeeds without production secrets present.
 */

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Public origin, used for checkout redirects, canonical URLs and emails. */
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),

  /** Postgres connection string. When absent, the in-memory store is used. */
  DATABASE_URL: z.string().url().optional(),

  /** Lemon Squeezy API key, from Settings → API. */
  LEMONSQUEEZY_API_KEY: z.string().min(1).optional(),
  /** Store ID, from Settings → Stores. */
  LEMONSQUEEZY_STORE_ID: z.string().min(1).optional(),
  /** Signing secret configured on the webhook in Lemon Squeezy. */
  LEMONSQUEEZY_WEBHOOK_SECRET: z.string().min(1).optional(),
  /** Variant IDs for each purchasable plan. */
  LEMONSQUEEZY_VARIANT_SINGLE: z.string().min(1).optional(),
  LEMONSQUEEZY_VARIANT_PACK: z.string().min(1).optional(),
  LEMONSQUEEZY_VARIANT_AGENCY: z.string().min(1).optional(),

  /** Resend API key for transactional email. Email is skipped when absent. */
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().default('Crawlable <hello@usecrawlable.com>'),

  /** Secret guarding cron and internal endpoints. */
  CRON_SECRET: z.string().min(16).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Reset the memoised env. Used by tests only. */
export function resetEnvCache(): void {
  cached = null;
}

/**
 * The public origin used for checkout redirects and email links.
 *
 * Delegates to the shared resolver so that every URL the product emits — page
 * canonicals, the sitemap, JSON-LD, llms.txt, receipts and report links — comes
 * from one source and cannot disagree.
 */
export function siteUrl(): string {
  return resolveSiteUrl();
}

export interface LemonSqueezyConfig {
  apiKey: string;
  storeId: string;
  webhookSecret: string;
  variants: { single: string; pack: string; agency: string };
}

/**
 * Read the Lemon Squeezy configuration, throwing a message that names the
 * missing variable rather than failing somewhere deep in a fetch call.
 */
export function lemonSqueezyConfig(): LemonSqueezyConfig {
  const e = env();
  const missing: string[] = [];
  if (!e.LEMONSQUEEZY_API_KEY) missing.push('LEMONSQUEEZY_API_KEY');
  if (!e.LEMONSQUEEZY_STORE_ID) missing.push('LEMONSQUEEZY_STORE_ID');
  if (!e.LEMONSQUEEZY_WEBHOOK_SECRET) missing.push('LEMONSQUEEZY_WEBHOOK_SECRET');
  if (!e.LEMONSQUEEZY_VARIANT_SINGLE) missing.push('LEMONSQUEEZY_VARIANT_SINGLE');
  if (!e.LEMONSQUEEZY_VARIANT_PACK) missing.push('LEMONSQUEEZY_VARIANT_PACK');
  if (!e.LEMONSQUEEZY_VARIANT_AGENCY) missing.push('LEMONSQUEEZY_VARIANT_AGENCY');

  if (missing.length > 0) {
    throw new Error(
      `Lemon Squeezy is not configured. Missing: ${missing.join(', ')}. See .env.example.`,
    );
  }

  return {
    apiKey: e.LEMONSQUEEZY_API_KEY as string,
    storeId: e.LEMONSQUEEZY_STORE_ID as string,
    webhookSecret: e.LEMONSQUEEZY_WEBHOOK_SECRET as string,
    variants: {
      single: e.LEMONSQUEEZY_VARIANT_SINGLE as string,
      pack: e.LEMONSQUEEZY_VARIANT_PACK as string,
      agency: e.LEMONSQUEEZY_VARIANT_AGENCY as string,
    },
  };
}

export function isLemonSqueezyConfigured(): boolean {
  try {
    lemonSqueezyConfig();
    return true;
  } catch {
    return false;
  }
}
