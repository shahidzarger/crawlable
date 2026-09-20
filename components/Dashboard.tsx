'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { AuditResult, AuditSummary } from '@/lib/audit/types';
import { SEVERITY, scoreColor } from '@/components/report/severity';

/**
 * The customer dashboard.
 *
 * There is no account system: the license key is the credential. It is kept in
 * localStorage on the customer's own device so they do not retype it, wrapped
 * in try/catch because private browsing and blocked site data make every
 * storage call throwable.
 */

const STORAGE_KEY = 'crawlable.license';

interface LicenseInfo {
  plan: string;
  keyTail: string;
  email: string;
  status: string;
  auditQuota: number | null;
  auditsUsed: number;
  creditsRemaining: number | null;
  brandName: string | null;
  brandColor: string | null;
}

function readStoredKey(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeStoredKey(key: string): void {
  try {
    if (key) window.localStorage.setItem(STORAGE_KEY, key);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable. The session still works, the key is just not remembered.
  }
}

export function Dashboard() {
  const [licenseKey, setLicenseKey] = useState('');
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const [auditUrl, setAuditUrl] = useState('');
  const [running, setRunning] = useState(false);
  const [latest, setLatest] = useState<AuditResult | null>(null);

  const load = useCallback(async (key: string) => {
    if (!key) return;
    setStatus('loading');
    setMessage(null);

    try {
      const response = await fetch('/api/audit', {
        headers: { Authorization: `Bearer ${key}` },
      });
      const payload = (await response.json()) as
        | { license: LicenseInfo; audits: AuditSummary[] }
        | { error: string };

      if (!response.ok || 'error' in payload) {
        setStatus('error');
        setMessage('error' in payload ? payload.error : 'Could not load your license.');
        return;
      }

      setLicense(payload.license);
      setAudits(payload.audits);
      setStatus('ready');
      writeStoredKey(key);
    } catch {
      setStatus('error');
      setMessage('Could not reach the server. Check your connection and try again.');
    }
  }, []);

  useEffect(() => {
    const stored = readStoredKey();
    if (stored) {
      setLicenseKey(stored);
      void load(stored);
    }
  }, [load]);

  async function runAudit(event: React.FormEvent) {
    event.preventDefault();
    const target = auditUrl.trim();
    if (!target || running) return;

    setRunning(true);
    setMessage(null);
    setLatest(null);

    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${licenseKey}`,
        },
        body: JSON.stringify({ url: target }),
      });

      const payload = (await response.json()) as
        | { audit: AuditResult; creditsRemaining: number | null }
        | { error: string };

      if (!response.ok || 'error' in payload) {
        setMessage('error' in payload ? payload.error : 'The audit failed.');
        return;
      }

      setLatest(payload.audit);
      setAuditUrl('');
      await load(licenseKey);
    } catch {
      setMessage('Could not reach the server. Your credit was not used.');
    } finally {
      setRunning(false);
    }
  }

  function signOut() {
    writeStoredKey('');
    setLicenseKey('');
    setLicense(null);
    setAudits([]);
    setLatest(null);
    setStatus('idle');
  }

  if (!license) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">Enter your license key</h1>
        <p className="mt-2 text-sm ink-secondary">
          It is in the receipt email from Lemon Squeezy. No password, no account.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void load(licenseKey.trim());
          }}
          className="mt-6 space-y-3"
        >
          <label htmlFor="license" className="sr-only">
            License key
          </label>
          <input
            id="license"
            type="text"
            spellCheck={false}
            autoComplete="off"
            value={licenseKey}
            onChange={(event) => setLicenseKey(event.target.value)}
            placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
            className="field w-full px-4 py-3 font-mono text-sm outline-none"
          />
          <button
            type="submit"
            className="btn-primary w-full px-5 py-3 text-sm"
            disabled={status === 'loading' || licenseKey.trim().length === 0}
          >
            {status === 'loading' ? 'Checking…' : 'Continue'}
          </button>
        </form>

        {message ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border p-3 text-sm"
            style={{ borderColor: 'var(--data-bad)' }}
          >
            <span aria-hidden style={{ color: 'var(--data-bad)' }}>
              {SEVERITY.critical.icon}{' '}
            </span>
            {message}
          </p>
        ) : null}

        <p className="mt-6 text-sm ink-secondary">
          No key yet?{' '}
          <Link href="/#pricing" className="underline underline-offset-4">
            See the plans
          </Link>
          .
        </p>
      </div>
    );
  }

  const remaining = license.creditsRemaining;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your audits</h1>
          <p className="mt-1 text-sm ink-secondary">
            {license.plan === 'agency' ? 'Agency' : license.plan === 'pack' ? 'Agency pack' : 'Single audit'}{' '}
            · key ending {license.keyTail} ·{' '}
            {remaining === null ? 'unlimited audits' : `${remaining} credit${remaining === 1 ? '' : 's'} left`}
          </p>
        </div>
        <button type="button" onClick={signOut} className="btn-ghost px-4 py-2 text-sm">
          Sign out
        </button>
      </header>

      <section className="surface-card p-6">
        <h2 className="font-semibold">Run an audit</h2>
        <p className="mt-1 text-sm ink-secondary">
          Up to 40 pages, sampled across your sitemap. Takes about a minute.
        </p>

        <form onSubmit={runAudit} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label htmlFor="audit-url" className="sr-only">
            Site to audit
          </label>
          <input
            id="audit-url"
            type="text"
            inputMode="url"
            spellCheck={false}
            value={auditUrl}
            onChange={(event) => setAuditUrl(event.target.value)}
            placeholder="clientdomain.com"
            className="field flex-1 px-4 py-3 text-sm outline-none"
            disabled={running || remaining === 0}
          />
          <button
            type="submit"
            className="btn-primary px-6 py-3 text-sm"
            disabled={running || auditUrl.trim().length === 0 || remaining === 0}
          >
            {running ? 'Crawling…' : 'Run audit'}
          </button>
        </form>

        {remaining === 0 ? (
          <p className="mt-3 text-sm" style={{ color: 'var(--data-warn)' }}>
            <span aria-hidden>{SEVERITY.warning.icon} </span>
            All credits on this license are used.{' '}
            <Link href="/#pricing" className="underline underline-offset-4">
              Add more
            </Link>
            .
          </p>
        ) : null}

        {message ? (
          <p
            role="alert"
            className="mt-3 rounded-xl border p-3 text-sm"
            style={{ borderColor: 'var(--data-bad)' }}
          >
            <span aria-hidden style={{ color: 'var(--data-bad)' }}>
              {SEVERITY.critical.icon}{' '}
            </span>
            {message}
          </p>
        ) : null}
      </section>

      {latest ? <LatestResult result={latest} licenseKey={licenseKey} /> : null}

      <section className="surface-card p-6">
        <h2 className="font-semibold">History</h2>
        {audits.length === 0 ? (
          <p className="mt-2 text-sm ink-secondary">No audits yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider ink-muted">
                  <th className="border-b py-2 pr-4 font-medium">Site</th>
                  <th className="border-b py-2 pr-4 text-right font-medium">Score</th>
                  <th className="border-b py-2 pr-4 text-right font-medium">Invisible</th>
                  <th className="border-b py-2 pr-4 text-right font-medium">Pages</th>
                  <th className="border-b py-2 pr-4 font-medium">Date</th>
                  <th className="border-b py-2 font-medium">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((audit) => (
                  <tr key={audit.id}>
                    <td className="border-b py-2.5 pr-4 font-mono text-xs">
                      {audit.siteUrl.replace(/^https?:\/\//, '')}
                    </td>
                    <td
                      className="border-b py-2.5 pr-4 text-right font-semibold tabular-nums"
                      style={{ color: scoreColor(audit.score) }}
                    >
                      {audit.score}
                    </td>
                    <td className="border-b py-2.5 pr-4 text-right tabular-nums ink-secondary">
                      {audit.invisiblePercent}%
                    </td>
                    <td className="border-b py-2.5 pr-4 text-right tabular-nums ink-secondary">
                      {audit.pagesAudited}
                    </td>
                    <td className="border-b py-2.5 pr-4 ink-secondary">
                      {new Date(audit.createdAt).toISOString().slice(0, 10)}
                    </td>
                    <td className="border-b py-2.5">
                      <Link
                        href={`/audit/${audit.id}`}
                        className="text-xs underline underline-offset-4"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {license.plan === 'agency' ? (
        <Branding licenseKey={licenseKey} license={license} onSaved={() => void load(licenseKey)} />
      ) : null}
    </div>
  );
}

function LatestResult({ result, licenseKey }: { result: AuditResult; licenseKey: string }) {
  const files = ['FIXES.md', 'llms.txt', 'robots.txt', 'schema.jsonld'] as const;

  async function download(file: string) {
    const response = await fetch(
      `/api/audit/${result.id}/download?file=${encodeURIComponent(file)}`,
      { headers: { Authorization: `Bearer ${licenseKey}` } },
    );

    if (!response.ok) return;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${result.siteUrl.replace(/^https?:\/\//, '')}-${file}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="surface-card p-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Audit complete</h2>
          <p className="mt-1 text-sm ink-secondary">
            <span className="font-semibold" style={{ color: scoreColor(result.score) }}>
              {result.score}/100
            </span>{' '}
            · {result.invisiblePercent}% of {result.pagesAudited} pages invisible to AI crawlers
          </p>
        </div>
        <Link href={`/audit/${result.id}`} className="btn-ghost px-4 py-2 text-sm">
          Open full report
        </Link>
      </div>

      <div className="mt-5">
        <h3 className="text-xs uppercase tracking-wider ink-muted">Download your files</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {files.map((file) => (
            <button
              key={file}
              type="button"
              onClick={() => void download(file)}
              className="btn-ghost px-3 py-1.5 font-mono text-xs"
            >
              ↓ {file}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Branding({
  licenseKey,
  license,
  onSaved,
}: {
  licenseKey: string;
  license: LicenseInfo;
  onSaved: () => void;
}) {
  const [brandName, setBrandName] = useState(license.brandName ?? '');
  const [brandColor, setBrandColor] = useState(license.brandColor ?? '#3ddc97');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const response = await fetch('/api/license', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${licenseKey}`,
        },
        body: JSON.stringify({
          brandName: brandName.trim() || null,
          brandColor: brandColor || null,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? 'Could not save branding.');
        return;
      }

      setSaved(true);
      onSaved();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="surface-card p-6">
      <h2 className="font-semibold">White-label branding</h2>
      <p className="mt-1 text-sm ink-secondary">
        Your name and colour appear on every report you share with a client.
      </p>

      <form onSubmit={save} className="mt-4 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="brand-name" className="block text-xs ink-muted">
            Agency name
          </label>
          <input
            id="brand-name"
            type="text"
            maxLength={60}
            value={brandName}
            onChange={(event) => setBrandName(event.target.value)}
            placeholder="Your agency"
            className="field mt-1.5 w-full px-3 py-2 text-sm outline-none"
          />
        </div>

        <div>
          <label htmlFor="brand-color" className="block text-xs ink-muted">
            Accent colour
          </label>
          <input
            id="brand-color"
            type="color"
            value={brandColor}
            onChange={(event) => setBrandColor(event.target.value)}
            className="field mt-1.5 h-[38px] w-20 cursor-pointer px-1 py-1"
          />
        </div>

        <button type="submit" className="btn-primary px-5 py-2 text-sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>

      {saved ? (
        <p className="mt-3 text-sm" style={{ color: 'var(--data-good)' }}>
          <span aria-hidden>✓ </span>Saved.
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm" style={{ color: 'var(--data-bad)' }}>
          <span aria-hidden>{SEVERITY.critical.icon} </span>
          {error}
        </p>
      ) : null}
    </section>
  );
}
