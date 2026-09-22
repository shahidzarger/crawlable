import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createZip } from '@/lib/audit/zip';

/**
 * The fix kit is the paid deliverable. A malformed archive would be discovered
 * by a customer, not by us, so these tests hand the bytes to the system `unzip`
 * rather than to our own reader — round-tripping through the code that wrote
 * the file proves nothing about whether anyone else can open it.
 */

const dirs: string[] = [];

function extractWith(entries: Array<{ name: string; content: string }>) {
  const dir = mkdtempSync(join(tmpdir(), 'zip-test-'));
  dirs.push(dir);
  const path = join(dir, 'kit.zip');
  writeFileSync(path, createZip(entries));
  return { dir, path };
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('createZip', () => {
  it('produces an archive the system unzip accepts', () => {
    const { path } = extractWith([
      { name: 'llms.txt', content: '# Example\n\nA line.\n' },
      { name: 'robots.txt', content: 'User-agent: GPTBot\nAllow: /\n' },
    ]);

    // -t tests the archive and verifies every CRC.
    const output = execFileSync('unzip', ['-t', path], { encoding: 'utf8' });
    expect(output).toMatch(/No errors detected/);
  });

  it('round-trips every file byte-for-byte through a real extractor', () => {
    const entries = [
      { name: 'FIXES.md', content: '# Fixes\n\n- One\n- Two\n' },
      { name: 'llms.txt', content: '# Site\n\n> Tagline\n' },
      { name: 'robots.txt', content: 'User-agent: *\nAllow: /\n' },
      { name: 'schema.jsonld', content: '{"@context":"https://schema.org"}' },
    ];
    const { dir, path } = extractWith(entries);

    execFileSync('unzip', ['-o', '-q', path, '-d', join(dir, 'out')]);

    for (const entry of entries) {
      const extracted = readFileSync(join(dir, 'out', entry.name), 'utf8');
      expect(extracted, `${entry.name} must survive the round trip`).toBe(entry.content);
    }
  });

  it('lists exactly the entries it was given', () => {
    const { path } = extractWith([
      { name: 'a.txt', content: 'a' },
      { name: 'b.txt', content: 'b' },
      { name: 'c.txt', content: 'c' },
    ]);

    const listing = execFileSync('unzip', ['-Z', '-1', path], { encoding: 'utf8' });
    expect(listing.trim().split('\n')).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });

  it('handles UTF-8 content and an empty file without corrupting offsets', () => {
    const entries = [
      { name: 'unicode.txt', content: 'Grüße — 日本語 — emoji ✓\n' },
      { name: 'empty.txt', content: '' },
      { name: 'after.txt', content: 'still correct\n' },
    ];
    const { dir, path } = extractWith(entries);

    expect(execFileSync('unzip', ['-t', path], { encoding: 'utf8' })).toMatch(
      /No errors detected/,
    );

    execFileSync('unzip', ['-o', '-q', path, '-d', join(dir, 'out')]);
    for (const entry of entries) {
      expect(readFileSync(join(dir, 'out', entry.name), 'utf8')).toBe(entry.content);
    }
  });

  it('writes the end-of-central-directory signature', () => {
    const buffer = createZip([{ name: 'x.txt', content: 'x' }]);
    expect(buffer.subarray(0, 4).toString('hex')).toBe('504b0304'); // local header
    expect(buffer.subarray(-22, -18).toString('hex')).toBe('504b0506'); // EOCD
  });
});
