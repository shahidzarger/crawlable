// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { FixKitDownloads } from '@/components/report/FixKitDownloads';
import { FIX_KIT_FILES } from '@/lib/audit/file-manifest';
import { LICENSE_STORAGE_KEY } from '@/lib/license-storage';

/**
 * Behaviour tests for the "Your generated files" card.
 *
 * These exist because the card listed four rows for a five-file kit: the row
 * list was a local copy of the file names, and adding sitemap.xml to the
 * generators did not touch it. A test that walks the manifest catches that
 * class of drift for every file added from here on, and the Copy/Download
 * assertions prove the new row is wired, not just rendered.
 */

const SITEMAP_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://example.com/</loc></url>\n</urlset>\n';

let fetchMock: ReturnType<typeof vi.fn>;
let clipboardWrites: string[];
let anchorClicks: Array<{ download: string; href: string }>;

beforeEach(() => {
  window.localStorage.setItem(LICENSE_STORAGE_KEY, 'TEST-LICENCE-KEY');

  fetchMock = vi.fn(async (url: string) =>
    new Response(SITEMAP_XML, { status: 200, headers: { 'Content-Type': 'application/xml' } }),
  );
  vi.stubGlobal('fetch', fetchMock);

  clipboardWrites = [];
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text: string) => void clipboardWrites.push(text) },
  });

  // jsdom implements neither of these; the download path needs both.
  vi.stubGlobal('URL', Object.assign(globalThis.URL, {
    createObjectURL: () => 'blob:stub',
    revokeObjectURL: () => undefined,
  }));

  anchorClicks = [];
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, ...rest) => {
    const element = realCreate(tag, ...(rest as []));
    if (tag === 'a') {
      element.addEventListener('click', (event) => {
        event.preventDefault();
        const anchor = element as HTMLAnchorElement;
        anchorClicks.push({ download: anchor.download, href: anchor.href });
      });
    }
    return element;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function row(label: string) {
  return screen.getByText(label).closest('li') as HTMLElement;
}

describe('FixKitDownloads', () => {
  it('renders a row for every file in the Fix Kit', async () => {
    render(<FixKitDownloads auditId="abc" siteUrl="https://example.com" />);
    await waitFor(() => expect(screen.getByText('Your generated files')).toBeTruthy());

    // Walks the manifest: a sixth file added later fails this until it has a row.
    for (const file of FIX_KIT_FILES) {
      expect(screen.getByText(file.label), file.label).toBeTruthy();
      expect(screen.getByText(file.blurb), file.blurb).toBeTruthy();
    }
    expect(screen.getAllByRole('listitem')).toHaveLength(FIX_KIT_FILES.length);
  });

  it('shows sitemap.xml with the copy it was specified with', async () => {
    render(<FixKitDownloads auditId="abc" siteUrl="https://example.com" />);
    await waitFor(() => expect(screen.getByText('sitemap.xml')).toBeTruthy());

    const sitemapRow = row('sitemap.xml');
    expect(
      within(sitemapRow).getByText(
        'Clean XML sitemap ready for Google Search Console and AI discovery',
      ),
    ).toBeTruthy();
    expect(within(sitemapRow).getByRole('button', { name: 'Copy' })).toBeTruthy();
    expect(within(sitemapRow).getByRole('button', { name: 'Download' })).toBeTruthy();
  });

  it('copies the XML to the clipboard', async () => {
    render(<FixKitDownloads auditId="abc" siteUrl="https://example.com" />);
    await waitFor(() => expect(screen.getByText('sitemap.xml')).toBeTruthy());

    within(row('sitemap.xml')).getByRole('button', { name: 'Copy' }).click();

    await waitFor(() => expect(clipboardWrites).toHaveLength(1));
    expect(clipboardWrites[0]).toBe(SITEMAP_XML);
    expect(clipboardWrites[0]).toContain('<urlset');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/audit/abc/download?file=sitemap.xml');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer TEST-LICENCE-KEY',
    );

    // Confirmation is shown, so a silent clipboard failure is not mistaken
    // for success.
    await waitFor(() =>
      expect(within(row('sitemap.xml')).getByRole('button', { name: 'Copied' })).toBeTruthy(),
    );
  });

  it('downloads sitemap.xml as a file, not the zip', async () => {
    render(<FixKitDownloads auditId="abc" siteUrl="https://example.com" />);
    await waitFor(() => expect(screen.getByText('sitemap.xml')).toBeTruthy());

    within(row('sitemap.xml')).getByRole('button', { name: 'Download' }).click();

    await waitFor(() => expect(anchorClicks).toHaveLength(1));
    expect(anchorClicks[0]?.download).toBe('example.com-sitemap.xml');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/audit/abc/download?file=sitemap.xml');
    expect(url).not.toContain('format=zip');
  });

  it('requests the whole kit for the zip button', async () => {
    render(<FixKitDownloads auditId="abc" siteUrl="https://example.com" />);
    await waitFor(() => expect(screen.getByText('Your generated files')).toBeTruthy());

    screen.getByRole('button', { name: /Download Fix Kit/ }).click();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      '/api/audit/abc/download?format=zip',
    );
  });

  it('asks for a licence key when none is stored', async () => {
    window.localStorage.clear();
    render(<FixKitDownloads auditId="abc" siteUrl="https://example.com" />);

    await waitFor(() => expect(screen.getByLabelText('Licence key')).toBeTruthy());
    expect(screen.queryByText('sitemap.xml')).toBeNull();
  });
});
