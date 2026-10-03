import { z } from 'zod';

/**
 * Blog frontmatter.
 *
 * Every field that ends up in a <meta> tag, a JSON-LD node, the sitemap or the
 * RSS feed is validated here, at build time, so a typo in a post fails the
 * build instead of shipping a page with an empty description or a date of
 * "Invalid Date" in its structured data.
 *
 * Two YAML traps are handled deliberately:
 *
 *   - An unquoted `date: 2026-10-03` is parsed by YAML into a JS Date at
 *     midnight UTC, while a quoted one stays a string. Both are accepted and
 *     normalised to the same YYYY-MM-DD string, so authors cannot get a
 *     different result from a pair of quote marks.
 *   - An unquoted `tags: geo` is a string, not a list. It is rejected rather
 *     than silently wrapped, because the same mistake in `title` would not be
 *     caught by anything else.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar date as YYYY-MM-DD, whether YAML handed us a string or a Date. */
const isoDate = z.preprocess(
  (value) => (value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString().slice(0, 10) : value),
  z
    .string()
    .regex(ISO_DATE, 'must be a date written as YYYY-MM-DD')
    .refine((value) => {
      const parsed = new Date(`${value}T00:00:00Z`);
      // Rejects 2026-02-30, which the regex alone would let through.
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    }, 'is not a real calendar date'),
);

/** A site-relative path ("/x") or an absolute http(s) URL. */
const urlOrPath = z
  .string()
  .trim()
  .refine((value) => {
    if (value.startsWith('/') && !value.startsWith('//')) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'must be a path starting with "/" or an absolute http(s) URL');

const TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const frontmatterSchema = z
  .object({
    title: z.string().trim().min(10).max(110),
    /*
     * Search engines truncate meta descriptions at roughly 155–160 characters
     * on desktop. The ceiling is a little higher than that because a slightly
     * long description is still useful to feed readers and AI crawlers; the
     * floor exists because a one-line description is almost always a mistake.
     */
    description: z.string().trim().min(50).max(200),
    date: isoDate,
    updated: isoDate.optional(),
    author: z.string().trim().min(2).max(80),
    tags: z
      .array(z.string().trim().regex(TAG, 'tags are lowercase-kebab-case'))
      .min(1)
      .max(6)
      .refine((tags) => new Set(tags).size === tags.length, 'tags must not repeat'),
    canonical: urlOrPath.optional(),
    ogImage: urlOrPath.optional(),
    draft: z.boolean().optional().default(false),
  })
  .strict()
  .refine((data) => !data.updated || data.updated >= data.date, {
    message: '`updated` cannot be earlier than `date`',
    path: ['updated'],
  });

export type Frontmatter = z.infer<typeof frontmatterSchema>;

/** A slug is the file name: lowercase words joined by single hyphens. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validate a post's frontmatter, with the file name in the error.
 *
 * Zod's default message names the field but not the post, which in a build
 * log of forty pages is the half of the information that matters.
 */
export function parseFrontmatter(data: unknown, file: string): Frontmatter {
  const result = frontmatterSchema.safeParse(data);
  if (result.success) return result.data;

  const problems = result.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid frontmatter in ${file}:\n${problems}`);
}
