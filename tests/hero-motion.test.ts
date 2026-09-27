import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The hero's class names must stay in a module the server can evaluate.
 *
 * Next.js turns every export of a 'use client' module into a client
 * reference. A plain object exported from HeroAnimation.tsx therefore reads
 * back as `undefined` inside app/page.tsx, which is a server component — the
 * hashed class names vanish from the rendered HTML, the hero renders with no
 * motion at all, and nothing anywhere throws. That happened once. These
 * assertions are what stops it happening again unnoticed.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

/**
 * True when the file opens with a use-client directive. Only the first
 * statement counts — the prose below it mentions the directive by name, and a
 * whole-file regex would match that and report the opposite of the truth.
 */
const declaresUseClient = (source: string): boolean =>
  /^\s*(['"])use client\1\s*;?/.test(source);

describe('hero motion class names', () => {
  it('lives in a module with no use-client directive', () => {
    const source = read('components/hero-motion.ts');
    expect(declaresUseClient(source)).toBe(false);
    expect(source).toMatch(/export const heroMotion/);
  });

  it('is not re-exported from the client wrapper', () => {
    const source = read('components/HeroAnimation.tsx');
    expect(declaresUseClient(source)).toBe(true);
    expect(source).not.toMatch(/export const heroMotion/);
  });

  it('is imported by the home page from the server-safe module', () => {
    const source = read('app/page.tsx');
    expect(source).toMatch(
      /import \{ heroMotion \} from '@\/components\/hero-motion'/,
    );
  });
});
