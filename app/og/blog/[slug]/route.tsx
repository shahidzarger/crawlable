import fs from 'node:fs';
import path from 'node:path';
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
 * Styled after the brand assets: white canvas with the 32px #F1F5F9 grid,
 * square emerald mark, Inter 800 headline, mono tag chips with the hard
 * offset shadow. Colours are written out because an image renderer has no
 * access to CSS variables. Inter is read from @fontsource at build time
 * (satori needs .woff, not .woff2).
 */
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

const SURFACE = '#FFFFFF';
const GRID = '#F1F5F9';
const BORDER = '#CBD5E1';
const SHADOW = '#E2E8F0';
const INK = '#0F172A';
const INK_SECONDARY = '#475569';
const ACCENT = '#15803D';

function fontFile(pkg: string, file: string): Buffer {
  return fs.readFileSync(path.join(process.cwd(), 'node_modules', '@fontsource', pkg, 'files', file));
}

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
          padding: '72px 80px 80px',
          backgroundColor: SURFACE,
          backgroundImage: `linear-gradient(${GRID} 1px, transparent 1px), linear-gradient(90deg, ${GRID} 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
          color: INK,
          fontFamily: 'Inter',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 24, height: 24, background: ACCENT }} />
          <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.6 }}>Crawlable</span>
          <span style={{ fontSize: 30, color: INK_SECONDARY, fontWeight: 400 }}>· Blog</span>
        </div>

        <div style={{ display: 'flex', fontSize: titleSize, fontWeight: 800, lineHeight: 1.1, letterSpacing: -2 }}>
          {post.title}
        </div>

        <div style={{ display: 'flex', gap: 14, fontSize: 22, color: INK, fontFamily: 'JetBrains Mono' }}>
          {post.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              style={{
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                padding: '8px 18px',
                boxShadow: `5px 5px 0 0 ${SHADOW}`,
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, background: ACCENT }} />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Inter', data: fontFile('inter', 'inter-latin-400-normal.woff'), weight: 400, style: 'normal' },
        { name: 'Inter', data: fontFile('inter', 'inter-latin-800-normal.woff'), weight: 800, style: 'normal' },
        { name: 'JetBrains Mono', data: fontFile('jetbrains-mono', 'jetbrains-mono-latin-400-normal.woff'), weight: 400, style: 'normal' },
      ],
    },
  );
}
