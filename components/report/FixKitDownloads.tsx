'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  downloadAuditFile,
  readStoredLicenseKey,
  writeStoredLicenseKey,
} from '@/lib/license-storage';
import { SEVERITY } from '@/components/report/severity';

/**
 * Download controls for a paid audit's generated files.
 *
 * Lives on the report page, which is a server component and therefore has no
 * access to the licence key. The key is in localStorage on the buyer's device,
 * so the controls have to be a client island.
 *
 * A report is shareable by link: a client can read the findings, but only the
 * buyer can pull the files. So this renders one of two things — the buttons if
 * a key is present, or a compact field to paste one if not. It never tells the
 * customer to go somewhere else to do the download.
 */

const FILES: Array<{ name: string; label: string; blurb: string }> = [
  {
    name: 'FIXES.md',
    label: 'FIXES.md',
    blurb: 'Every finding, ordered by impact, with the affected URLs',
  },
  {
    name: 'llms.txt',
    label: 'llms.txt',
    blurb: 'Built from your real pages and sections',
  },
  {
    name: 'robots.txt',
    label: 'robots.txt',
    blurb: 'Retrieval crawlers allowed, your existing rules preserved',
  },
  {
    name: 'schema.jsonld',
    label: 'JSON-LD schema',
    blurb: 'Organization, WebSite and BreadcrumbList blocks',
  },
];

export function FixKitDownloads({
  auditId,
  siteUrl,
}: {
  auditId: string;
  siteUrl: string;
}) {
  const [licenseKey, setLicenseKey] = useState('');
  const [draftKey, setDraftKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Rendered only after mount: the server has no localStorage, so deciding
  // which branch to show during SSR would guarantee a hydration mismatch.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLicenseKey(readStoredLicenseKey());
    setReady(true);
  }, []);

  async function handleDownload(file: string) {
    setBusy(file);
    setError(null);
    const result = await downloadAuditFile({ auditId, licenseKey, file, siteUrl });
    if (!result.ok) setError(result.error);
    setBusy(null);
  }

  async function handleCopy(file: string) {
    setBusy(file);
    setError(null);
    try {
      const response = await fetch(
        `/api/audit/${auditId}/download?file=${encodeURIComponent(file)}`,
        { headers: { Authorization: `Bearer ${licenseKey}` } },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? 'Could not load that file.');
      } else {
        await navigator.clipboard.writeText(await response.text());
        setCopied(file);
        setTimeout(() => setCopied(null), 2000);
      }
    } catch {
      setError('Could not copy. Your browser may be blocking clipboard access.');
    }
    setBusy(null);
  }

  if (!ready) {
    return (
      <section className="surface-card p-6">
        <h2 className="font-semibold">Your generated files</h2>
        <p className="mt-2 text-sm ink-secondary">Loading your licence…</p>
      </section>
    );
  }

  if (!licenseKey) {
    return (
      <section className="surface-card p-6">
        <h2 className="font-semibold">Your generated files</h2>
        <p className="mt-2 text-sm leading-relaxed ink-secondary">
          This report is readable by anyone with the link, but the generated files belong to
          the licence that paid for the audit. Paste your key to download them here.
        </p>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = draftKey.trim();
            if (!trimmed) return;
            writeStoredLicenseKey(trimmed);
            setLicenseKey(trimmed);
          }}
        >
          <input
            type="text"
            spellCheck={false}
            autoComplete="off"
            value={draftKey}
            onChange={(event) => setDraftKey(event.target.value)}
            placeholder="Your licence key"
            aria-label="Licence key"
            className="field flex-1 px-4 py-2.5 font-mono text-sm outline-none"
          />
          <button type="submit" className="btn-primary px-5 py-2.5 text-sm">
            Unlock downloads
          </button>
        </form>
        <p className="mt-3 text-xs ink-muted">
          It was emailed to you at purchase, and is remembered on this device once entered.
        </p>
      </section>
    );
  }

  return (
    <section className="surface-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Your generated files</h2>
          <p className="mt-1 text-sm ink-secondary">
            Generated from this crawl, not from a template.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleDownload('zip')}
          disabled={busy !== null}
          className="btn-primary px-5 py-2.5 text-sm"
        >
          {busy === 'zip' ? 'Preparing…' : 'Download Fix Kit (.zip)'}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-md border p-3 text-sm"
          style={{ borderColor: 'var(--data-bad)' }}
        >
          <span aria-hidden style={{ color: 'var(--data-bad)' }}>
            {SEVERITY.critical.icon}{' '}
          </span>
          {error}
        </p>
      ) : null}

      <ul className="mt-5 space-y-3">
        {FILES.map((file) => (
          <li
            key={file.name}
            className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0"
          >
            <div className="min-w-0">
              <code
                className="rounded-md px-2 py-0.5 font-mono text-xs"
                style={{ background: 'var(--surface-sunken)', color: 'var(--accent)' }}
              >
                {file.label}
              </code>
              <p className="mt-1 text-sm ink-secondary">{file.blurb}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => void handleCopy(file.name)}
                disabled={busy !== null}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                {copied === file.name ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() => void handleDownload(file.name)}
                disabled={busy !== null}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                {busy === file.name ? '…' : 'Download'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-xs ink-muted">
        Review each file before publishing it — a wrong robots.txt can remove you from search.{' '}
        <Link href="/dashboard" className="underline underline-offset-4">
          All your audits
        </Link>
      </p>
    </section>
  );
}
