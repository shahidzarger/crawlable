import localFont from 'next/font/local';

/**
 * Brand typefaces, self-hosted.
 *
 * Inter for interface and prose, JetBrains Mono for terminal and code — the
 * pair the brand assets specify. Loaded through next/font/local from the
 * @fontsource packages rather than next/font/google, so a build never depends
 * on reaching Google Fonts and the files are served from our own origin with
 * the size-adjusted fallback next/font generates (no layout shift on swap).
 *
 * Latin only: the site is English, and each extra subset is another file on
 * the critical path.
 */
export const inter = localFont({
  src: [
    { path: '../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: '../node_modules/@fontsource/inter/files/inter-latin-800-normal.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-sans',
  display: 'swap',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif'],
});

export const jetbrainsMono = localFont({
  src: [
    { path: '../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-mono',
  display: 'swap',
  // Mono text is never above the fold's critical path except the terminal,
  // so it is not preloaded; Inter is.
  preload: false,
  fallback: ['SFMono-Regular', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
});
