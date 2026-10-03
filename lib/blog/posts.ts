import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { SLUG, parseFrontmatter, type Frontmatter } from './frontmatter';

/**
 * The file-based content layer for /blog.
 *
 * Posts are MDX files in content/blog/, one per post, named <slug>.mdx. There
 * is no database and no separate build step: every blog route is statically
 * generated, so this module runs at build time only, and a malformed post
 * fails `next build` with the file name in the message.
 *
 * Drafts (`draft: true`) are excluded everywhere — listing, sitemap, feed,
 * llms.txt and static params — so a draft has no URL at all in production
 * rather than an unlisted one that a crawler can still stumble on.
 */

export const CONTENT_DIR = path.join(process.cwd(), 'content', 'blog');

/** Average adult silent-reading speed for non-fiction, in words per minute. */
const WORDS_PER_MINUTE = 230;

export interface Post extends Frontmatter {
  slug: string;
  /** The MDX body, frontmatter removed. */
  body: string;
  /** Whole minutes, never less than one. */
  readingMinutes: number;
  /** `updated` when present, otherwise `date`. Used for sitemap and dateModified. */
  lastModified: string;
}

/** What the index page and the feed need — no body. */
export type PostSummary = Omit<Post, 'body'>;

/**
 * Estimate reading time from the prose.
 *
 * Fenced code is excluded: a reader skims a twenty-line robots.txt in seconds,
 * and counting it as prose would overstate a code-heavy post by minutes. JSX
 * component tags are excluded for the same reason — they are not words.
 */
export function readingMinutes(body: string): number {
  const prose = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[A-Z][^>]*\/>/g, ' ')
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ');
  const words = prose.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

export function parsePost(slug: string, source: string, file = `${slug}.mdx`): Post {
  if (!SLUG.test(slug)) {
    throw new Error(
      `Invalid post file name ${file}: use lowercase words joined by hyphens, e.g. what-is-geo.mdx`,
    );
  }

  const { data, content } = matter(source);
  const frontmatter = parseFrontmatter(data, file);

  return {
    ...frontmatter,
    slug,
    body: content,
    readingMinutes: readingMinutes(content),
    lastModified: frontmatter.updated ?? frontmatter.date,
  };
}

/** Newest first; ties broken by slug so the order is stable between builds. */
function byDateDesc(a: PostSummary, b: PostSummary): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.slug.localeCompare(b.slug);
}

/** Read and validate every post in a directory, drafts included. */
export function loadPosts(dir: string = CONTENT_DIR): Post[] {
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((name) => /\.mdx?$/.test(name));
  const posts = files.map((name) =>
    parsePost(name.replace(/\.mdx?$/, ''), fs.readFileSync(path.join(dir, name), 'utf8'), name),
  );

  const seen = new Set<string>();
  for (const post of posts) {
    // a.md and a.mdx would otherwise both claim /blog/a.
    if (seen.has(post.slug)) throw new Error(`Two posts share the slug "${post.slug}"`);
    seen.add(post.slug);
  }

  return posts.sort(byDateDesc);
}

let cache: Post[] | null = null;

/**
 * Every published post, newest first.
 *
 * Cached for the life of the process in production builds, where the files
 * cannot change; re-read on every call in development so edits show up
 * without restarting the server.
 */
export function getAllPosts(): Post[] {
  if (cache && process.env.NODE_ENV === 'production') return cache;
  const published = loadPosts().filter((post) => !post.draft);
  cache = published;
  return published;
}

export function getPost(slug: string): Post | undefined {
  return getAllPosts().find((post) => post.slug === slug);
}

export function summarise(post: Post): PostSummary {
  const { body, ...summary } = post;
  return summary;
}

export function getPostSummaries(): PostSummary[] {
  return getAllPosts().map(summarise);
}

/** Every tag in use, most-used first, then alphabetical. */
export function getAllTags(posts: readonly PostSummary[] = getPostSummaries()): string[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}

/** Posts sharing the most tags with `post`, excluding itself. */
export function relatedPosts(post: PostSummary, limit = 3): PostSummary[] {
  return getPostSummaries()
    .filter((other) => other.slug !== post.slug)
    .map((other) => ({
      other,
      shared: other.tags.filter((tag) => post.tags.includes(tag)).length,
    }))
    .filter(({ shared }) => shared > 0)
    .sort((a, b) => b.shared - a.shared || byDateDesc(a.other, b.other))
    .slice(0, limit)
    .map(({ other }) => other);
}

/** Format a YYYY-MM-DD date for display, in UTC so no reader sees it shift a day. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
}
