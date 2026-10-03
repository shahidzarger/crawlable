import { ImageResponse } from 'next/og';
import { getAllPosts, getPost } from '@/lib/blog/posts';

/**
 * Generated 1200×630 share image for each post, at /og/blog/<slug>.
 *
 * A route handler rather than the opengraph-image file convention, because the
 * file convention always wins over metadata — and a post that sets `ogImage`
 * in its frontmatter must be able to override the generated card.
 *
 * Built statically: one PNG per post at build time, served from the CDN.
 * Colours are the dark-theme tokens from globals.css, written out because an
 * image renderer has no access to CSS variables.
 */
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

const SURFACE = '#08090c';
const BORDER = '#2c3342';
const INK = '#e6e9ef';
const INK_SECONDARY = '#98a1b2';
const ACCENT = '#3ddc97';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return new Response('Not found', { status: 404 });

  // Long titles step down a size rather than overflowing the card.
  const titleSize = post.title.length > 70 ? 56 : 66;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: SURFACE,
          color: INK,
          border: `1px solid ${BORDER}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, fontWeight: 600 }}>
          <div style={{ width: 22, height: 22, borderRadius: 5, background: ACCENT }} />
          <span>Crawlable</span>
          <span style={{ color: INK_SECONDARY, fontWeight: 400 }}>· Blog</span>
        </div>

        <div style={{ display: 'flex', fontSize: titleSize, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1 }}>
          {post.title}
        </div>

        <div style={{ display: 'flex', gap: 12, fontSize: 24, color: INK_SECONDARY }}>
          {post.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              style={{ border: `1px solid ${BORDER}`, borderRadius: 999, padding: '6px 18px' }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
