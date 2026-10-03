'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { PostSummary } from '@/lib/blog/posts';

/**
 * The /blog listing with search and tag filtering.
 *
 * The server renders every post, unfiltered — that HTML is what crawlers and
 * no-JavaScript readers get, so nothing on the index depends on hydration.
 * Filtering is a client-side refinement over that list. The query and tag are
 * mirrored into the URL with replaceState so a filtered view can be shared,
 * and so a post's tag links (/blog?tag=x) open the index already filtered.
 * Those URLs are not separate pages: /blog declares itself canonical, so a
 * crawler that follows a tag link consolidates it into the one index.
 */

export interface IndexPost extends Pick<PostSummary, 'slug' | 'title' | 'description' | 'tags' | 'readingMinutes' | 'date'> {
  displayDate: string;
}

export function matchesQuery(post: IndexPost, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${post.title} ${post.description} ${post.tags.join(' ')}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function BlogIndex({ posts, tags }: { posts: IndexPost[]; tags: string[] }) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);

  // Restore a shared filter from the URL once, after hydration.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialTag = params.get('tag');
    if (initialTag && tags.includes(initialTag)) setTag(initialTag);
    const initialQuery = params.get('q');
    if (initialQuery) setQuery(initialQuery);
  }, [tags]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (tag) params.set('tag', tag);
    if (query.trim()) params.set('q', query.trim());
    const search = params.toString();
    const next = `${window.location.pathname}${search ? `?${search}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', next);
    }
  }, [query, tag]);

  const visible = useMemo(
    () => posts.filter((post) => (!tag || post.tags.includes(tag)) && matchesQuery(post, query)),
    [posts, query, tag],
  );

  return (
    <div>
      <div className="flex flex-col gap-4">
        <label className="block max-w-md">
          <span className="sr-only">Search articles</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search articles"
            className="field w-full px-4 py-2.5 text-sm"
          />
        </label>

        <div role="group" aria-label="Filter by tag" className="flex flex-wrap gap-2">
          <TagButton label="All" pressed={tag === null} onClick={() => setTag(null)} />
          {tags.map((item) => (
            <TagButton
              key={item}
              label={item}
              pressed={tag === item}
              onClick={() => setTag(tag === item ? null : item)}
            />
          ))}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {visible.length} {visible.length === 1 ? 'article' : 'articles'} shown
      </p>

      {visible.length === 0 ? (
        <p className="mt-10 ink-secondary">
          No articles match that search.{' '}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => {
              setQuery('');
              setTag(null);
            }}
          >
            Clear filters
          </button>
        </p>
      ) : (
        <ul className="mt-8 grid gap-5 md:grid-cols-2">
          {visible.map((post) => (
            <li key={post.slug}>
              <article className="surface-card flex h-full flex-col p-6 transition-colors hover:border-[var(--border-strong)]">
                <p className="text-xs ink-muted">
                  <time dateTime={post.date}>{post.displayDate}</time> · {post.readingMinutes} min
                  read
                </p>
                <h2 className="mt-2 text-xl font-semibold leading-snug tracking-tight">
                  <Link href={`/blog/${post.slug}`} className="hover:underline underline-offset-4">
                    {post.title}
                  </Link>
                </h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed ink-secondary">
                  {post.description}
                </p>
                <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Tags">
                  {post.tags.map((item) => (
                    <li
                      key={item}
                      className="rounded-full border px-2.5 py-0.5 font-mono text-[11px] ink-secondary"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TagButton({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="rounded-full border px-3 py-1 font-mono text-xs transition-colors"
      style={
        pressed
          ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' }
          : { color: 'var(--ink-secondary)' }
      }
    >
      {label}
    </button>
  );
}
