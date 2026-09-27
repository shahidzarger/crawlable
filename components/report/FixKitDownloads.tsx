'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  downloadAuditFile,
  readStoredLicenseKey,
  writeStoredLicenseKey,
} from '@/lib/license-storage';
import { SEVERITY } from '@/components/report/severity';
import { FIX_KIT_FILES } from '@/lib/audit/file-manifest';

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

/*
 * The rows come from the Fix Kit manifest, not from a list kept here.
 *
 * A local copy is what made this card show four rows for a five-file kit:
 * sitemap.xml was added to the generators and to the archive, and this list
 * was not touched. Reading the manifest means the UI cannot fall behind the
 * kit again, and the order matches FIXES.md's deployment order.
 */
const FILES = FIX_KIT_FILES;

export function FixKitDownloads({
  auditId,
  siteUrl,
  /**
   * True when no licence owns this report — a free beta audit.
   *
   * Decided on the server from the stored record, not inferred from whether
   * a key happens to sit in this browser's localStorage. A visitor who has
   * bought a plan still cannot unlock somebody else's free report, and the
   * download route refuses it regardless of what this component renders.
   */
  unowned = false,
}: {
  auditId: string;
  siteUrl: string;
  unowned?: boolean;
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

  if (unowned) return <LockedFixKit siteUrl={siteUrl} />;

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
            className="field flex-1 px-4 py-2.5 font-mono text-sm"
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

/**
 * The paid boundary, as the visitor sees it.
 *
 * Shown for a report that no licence owns. It states plainly what the free
 * audit did and did not include, rather than teasing a download that would
 * 403 — a locked button that fails on click is worse than an honest one.
 */
function LockedFixKit({ siteUrl }: { siteUrl: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function notify(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || state === 'sending') return;
    setState('sending');

    try {
      const response = await fetch('/api/notify-me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), context: `fix-kit report for ${siteUrl}` }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? 'Could not record that. Try again shortly.');
        setState('error');
        return;
      }
      setState('done');
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
      setState('error');
    }
  }

  return (
    <section className="surface-card p-6" style={{ borderColor: 'var(--accent)' }}>
      <h2 className="text-lg font-semibold tracking-tight">Unlock Production Fix Kit (.zip)</h2>
      <p className="mt-2 text-sm leading-relaxed ink-secondary">
        Your audit above is complete and yours to keep. The Fix Kit is the other half: five
        production-ready files generated from this crawl —{' '}
        <code className="font-mono text-xs">robots.txt</code>,{' '}
        <code className="font-mono text-xs">sitemap.xml</code>,{' '}
        <code className="font-mono text-xs">llms.txt</code>,{' '}
        <code className="font-mono text-xs">schema.jsonld</code> and a{' '}
        <code className="font-mono text-xs">FIXES.md</code> telling you where each one goes.
      </p>

      {state === 'done' ? (
        <p className="mt-5 text-sm" role="status">
          <span aria-hidden style={{ color: 'var(--data-good)' }}>
            ✓
          </span>{' '}
          You are on the list. We will email you the moment Fix Kits open.
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm font-medium">
            Store launching shortly — enter your email to be notified when Fix Kits open
          </p>
          <form onSubmit={notify} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label htmlFor="notify-email" className="sr-only">
              Email address
            </label>
            <input
              id="notify-email"
              type="email"
              required
              spellCheck={false}
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={state === 'sending'}
              placeholder="you@company.com"
              className="field flex-1 px-4 py-2.5 text-sm disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={state === 'sending' || email.trim().length === 0}
              aria-busy={state === 'sending'}
              className="btn-primary whitespace-nowrap px-5 py-2.5 text-sm"
            >
              {state === 'sending' ? 'Adding…' : 'Notify me'}
            </button>
          </form>
          {state === 'error' ? (
            <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--ink-bad)' }}>
              {message}
            </p>
          ) : null}
        </>
      )}

      <p className="mt-4 text-xs ink-muted">
        Already have a licence key? Run this domain from your{' '}
        <Link href="/dashboard" className="underline underline-offset-4">
          dashboard
        </Link>{' '}
        to generate its Fix Kit — a free audit cannot be converted after the fact.
      </p>
    </section>
  );
}
