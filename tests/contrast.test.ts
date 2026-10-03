import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every text token must be readable on every surface, in both themes.
 *
 * Measured, not assumed: an axe-core run found ~140 contrast failures across
 * the site, and 96% of them were one token — --ink-muted was #6b7689 in BOTH
 * themes, which cannot be right against a near-black and a near-white surface
 * at once, and measured 3.86:1 at worst against a 4.5:1 floor. This parses
 * globals.css itself, so a future token edit that reintroduces that fails
 * here instead of in an accessibility complaint.
 *
 * WCAG 2.x AA: 4.5:1 for body text. Large text only needs 3:1, but these
 * tokens are used at 12px, so every pair is held to 4.5.
 */

const CSS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
const AA = 4.5;

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    const [, name, value] = m;
    if (name && value) out[name] = value.toLowerCase();
  }
  return out;
}

/** The body of the first rule whose selector matches, braces balanced. */
function block(selector: RegExp): string {
  const m = selector.exec(CSS);
  if (!m) throw new Error(`No rule matching ${selector}`);
  let depth = 0;
  const start = CSS.indexOf('{', m.index);
  for (let i = start; i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1;
    if (CSS[i] === '}' && --depth === 0) return CSS.slice(start + 1, i);
  }
  throw new Error('Unbalanced braces');
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/*
 * Light is the brand default (:root); dark is the OS-preference variant,
 * reachable through the media query or an explicit data-theme.
 */
const THEMES = {
  light: tokens(block(/^:root\s*\{/m)),
  'dark (data-theme)': tokens(block(/:root\[data-theme='dark'\]\s*\{/)),
  'dark (prefers-color-scheme)': tokens(block(/:root:not\(\[data-theme='light'\]\)\s*\{/)),
};

const TEXT = ['ink-primary', 'ink-secondary', 'ink-muted', 'ink-good', 'ink-warn', 'ink-bad'];
const SURFACES = ['surface', 'surface-raised', 'surface-sunken'];

describe('colour contrast', () => {
  for (const [theme, t] of Object.entries(THEMES)) {
    describe(theme, () => {
      it('defines every text and surface token', () => {
        for (const name of [...TEXT, ...SURFACES, 'accent', 'accent-ink']) {
          expect(t[name], `--${name} in ${theme}`).toMatch(/^#[0-9a-f]{6}$/);
        }
      });

      for (const ink of TEXT) {
        for (const surface of SURFACES) {
          it(`--${ink} on --${surface} clears AA`, () => {
            const fg = t[ink] as string;
            const bg = t[surface] as string;
            expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(AA);
          });
        }
      }

      it('primary-button text on the accent clears AA', () => {
        const fg = t['accent-ink'] as string;
        const bg = t.accent as string;
        expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(AA);
      });

      it('keeps muted visibly quieter than secondary, or the hierarchy is gone', () => {
        const surface = t.surface as string;
        expect(ratio(t['ink-muted'] as string, surface)).toBeLessThan(
          ratio(t['ink-secondary'] as string, surface),
        );
      });
    });
  }

  it('keeps both dark-theme blocks identical, so the toggle and the OS agree', () => {
    expect(THEMES['dark (data-theme)']).toEqual(THEMES['dark (prefers-color-scheme)']);
  });

  /*
   * The default theme IS the brand. These are the exact values in the brand
   * assets (Product Hunt gallery + thumbnail SVGs); a token edit that drifts
   * from them should be a deliberate brand change, not an accident.
   */
  it('uses the brand palette for the default theme', () => {
    expect(THEMES.light).toMatchObject({
      surface: '#ffffff',
      'surface-sunken': '#f8fafc',
      border: '#e2e8f0',
      'border-strong': '#cbd5e1',
      'ink-primary': '#0f172a',
      'ink-secondary': '#475569',
      'ink-muted': '#64748b',
      accent: '#15803d',
      'accent-soft': '#f0fdf4',
      grid: '#f1f5f9',
      shadow: '#e2e8f0',
      'term-bg': '#0f172a',
      'term-prompt': '#4ade80',
    });
  });
});
