'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { AuditResult, AuditSummary } from '@/lib/audit/types';
import { SEVERITY, scoreColor } from '@/components/report/severity';
import { planById } from '@/lib/plans';
import {
  downloadAuditFile,
  readStoredLicenseKey,
  writeStoredLicenseKey,
} from '@/lib/license-storage';

/**
 * The customer dashboard.
 *
 * There is no account system: the license key is the credential. It is kept in
 * localStorage on the customer's own device so they do not retype it, wrapped
 * in try/catch because private browsing and blocked site data make every
 * storage call throwable.
 */

interface LicenseInfo {
  plan: string;
  keyTail: string;
  email: string;
  status: string;
  auditQuota: number | null;
  auditsUsed: number;
  creditsRemaining: number | null;
  /** Website slots on a subscription plan; null when the plan burns credits. */
  domainLimit: number | null;
}

interface DomainSlot {
  domain: string;
  createdAt: string;
  lastScannedAt: string | null;
}

// Storage lives in lib/license-storage so the report page reads and writes the
// same entry — two copies of the key name is how a customer ends up unlocked on
// one page and not the other.
const readStoredKey = readStoredLicenseKey;
const writeStoredKey = writeStoredLicenseKey;

export function Dashboard() {
  const [licenseKey, setLicenseKey] = useState('');
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const [auditUrl, setAuditUrl] = useState('');
  const [running, setRunning] = useState(false);
  /**
   * The domain whose Re-audit button was clicked, or null.
   *
   * Separate from `running` because the two answer different questions.
   * `running` is "is a crawl in progress" and gates every control. This is
   * "which control started it" and decides which one shows progress — a
   * single shared boolean made all three slots claim to be crawling.
   */
  const [crawlingDomain, setCrawlingDomain] = useState<string | null>(null);
  const [latest, setLatest] = useState<AuditResult | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [domains, setDomains] = useState<DomainSlot[]>([]);
  /** Set when the API refuses a fourth domain, so the upsell can be shown. */
  const [domainLimitHit, setDomainLimitHit] = useState(false);

  /** Re-download a past audit's kit without re-running the crawl. */
  async function downloadKit(audit: AuditSummary) {
    setDownloading(audit.id);
    const result = await downloadAuditFile({
      auditId: audit.id,
      licenseKey,
      file: 'zip',
      siteUrl: audit.siteUrl,
    });
    if (!result.ok) setMessage(result.error);
    setDownloading(null);
  }

  const load = useCallback(async (key: string) => {
    if (!key) return;
    setStatus('loading');
    setMessage(null);

    try {
      const response = await fetch('/api/audit', {
        headers: { Authorization: `Bearer ${key}` },
      });
      const payload = (await response.json()) as
        | { license: LicenseInfo; audits: AuditSummary[]; domains?: DomainSlot[] }
        | { error: string };

      if (!response.ok || 'error' in payload) {
        setStatus('error');
        setMessage('error' in payload ? payload.error : 'Could not load your license.');
        return;
      }

      setLicense(payload.license);
      setAudits(payload.audits);
      setDomains(payload.domains ?? []);
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

  async function runAudit(event: React.FormEvent, overrideUrl?: string) {
    event.preventDefault();
    const target = (overrideUrl ?? auditUrl).trim();
    if (!target || running) return;

    setRunning(true);
    // Which slot, if any, started this crawl. `running` still gates every
    // control against concurrent audits; this only decides which one is
    // allowed to say so.
    setCrawlingDomain(overrideUrl ? target : null);
    setMessage(null);
    setDomainLimitHit(false);
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
        | { error: string; code?: string };

      if (!response.ok || 'error' in payload) {
        // A refused fourth domain is an upsell, not a failure — it gets its
        // own panel with a purchase link rather than the generic error line.
        if ('code' in payload && payload.code === 'DOMAIN_LIMIT_REACHED') {
          setDomainLimitHit(true);
        } else {
          setMessage('error' in payload ? payload.error : 'The audit failed.');
        }
        return;
      }

      setLatest(payload.audit);
      setAuditUrl('');
      await load(licenseKey);
    } catch {
      setMessage('Could not reach the server. Your credit was not used.');
    } finally {
      setRunning(false);
      // In `finally`, so a thrown error or an early return cannot leave a slot
      // stuck reading "Crawling…" forever.
      setCrawlingDomain(null);
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
  const slotLimit = license.domainLimit;
  const isSlotPlan = slotLimit !== null;
  const slotsFree = isSlotPlan ? Math.max(0, slotLimit - domains.length) : 0;
  const packUrl = process.env.NEXT_PUBLIC_LS_BUY_PACK;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your audits</h1>
          <p className="mt-1 text-sm ink-secondary">
            {/* Read from the catalogue so a plan rename cannot drift out of sync here. */}
            {planById(license.plan)?.name ?? license.plan} · key ending {license.keyTail} ·{' '}
            {/*
              A slot plan reports sites, not credits. Saying "unlimited audits"
              here would be true but misleading: re-audits are unlimited, the
              number of sites is not, and the limit is what a customer needs to
              see before they hit it.
            */}
            {isSlotPlan
              ? `${domains.length}/${slotLimit} monitored domains`
              : remaining === null
                ? 'unlimited audits'
                : `${remaining} credit${remaining === 1 ? '' : 's'} left`}
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
          {isSlotPlan
            ? slotsFree > 0
              ? ` ${slotsFree} of your ${slotLimit} domain slots ${slotsFree === 1 ? 'is' : 'are'} still free.`
              : ' All your domain slots are in use — re-audit any of them below at no cost.'
            : ''}
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

      {/*
        The upsell panel, shown only after the API actually refuses a domain.
        Not a modal: the customer is mid-task with a URL they still want
        audited, and a dialog they must dismiss to re-read their own slot list
        would be in the way of the decision they are being asked to make.
      */}
      {domainLimitHit ? (
        <section
          role="alert"
          className="surface-card p-6"
          style={{ borderColor: 'var(--data-warn)' }}
        >
          <h2 className="font-semibold">
            <span aria-hidden style={{ color: 'var(--data-warn)' }}>
              {SEVERITY.warning.icon}{' '}
            </span>
            All {slotLimit} domain slots are in use
          </h2>
          <p className="mt-2 text-sm leading-relaxed ink-secondary">
            Agency Pro covers {slotLimit} websites with unlimited re-audits. You can
            re-audit any domain below as often as you like at no cost — or buy a Growth
            Pack for five one-time audits on other sites. Credits never expire.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {packUrl ? (
              <a
                href={`${packUrl}${packUrl.includes('?') ? '&' : '?'}checkout%5Bcustom%5D%5Bplan%5D=pack`}
                className="btn-primary px-5 py-2.5 text-sm"
              >
                Get a Growth Pack
              </a>
            ) : (
              <Link href="/#pricing" className="btn-primary px-5 py-2.5 text-sm">
                See the plans
              </Link>
            )}
            <button
              type="button"
              onClick={() => setDomainLimitHit(false)}
              className="btn-ghost px-5 py-2.5 text-sm"
            >
              Dismiss
            </button>
          </div>
        </section>
      ) : null}

      {isSlotPlan ? (
        <section className="surface-card p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">
              Monitored Domains ({domains.length}/{slotLimit})
            </h2>
            <p className="text-xs ink-muted">Unlimited re-audits on every slot</p>
          </div>

          <ul className="mt-4 space-y-2">
            {Array.from({ length: slotLimit }).map((_, index) => {
              const slot = domains[index];
              return (
                <li
                  key={slot?.domain ?? `empty-${index}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3"
                >
                  {slot ? (
                    <>
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm">{slot.domain}</p>
                        <p className="mt-0.5 text-xs ink-muted">
                          {slot.lastScannedAt
                            ? `Last audited ${slot.lastScannedAt.slice(0, 10)}`
                            : 'Not audited yet'}
                        </p>
                      </div>
                      {/*
                        Only the slot that was clicked reports progress.
                        Every slot stays disabled while any crawl runs — one
                        audit at a time is still the rule — but a disabled
                        button that says "Crawling…" is claiming to be doing
                        work it is not, which is what made all three look busy.
                      */}
                      <button
                        type="button"
                        onClick={(event) => void runAudit(event, slot.domain)}
                        disabled={running}
                        aria-busy={crawlingDomain === slot.domain}
                        className="btn-ghost shrink-0 px-4 py-2 text-xs"
                      >
                        {crawlingDomain === slot.domain ? 'Crawling…' : 'Re-audit'}
                      </button>
                    </>
                  ) : (
                    <p className="text-sm ink-muted">
                      Slot {index + 1} — free. Audit any domain to claim it.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

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
                      <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                        {audit.mode === 'audit' ? (
                          <button
                            type="button"
                            onClick={() => void downloadKit(audit)}
                            disabled={downloading === audit.id}
                            className="btn-ghost px-3 py-1.5 text-xs"
                          >
                            {downloading === audit.id ? '…' : 'Fix Kit (.zip)'}
                          </button>
                        ) : null}
                        <Link
                          href={`/audit/${audit.id}`}
                          className="text-xs underline underline-offset-4"
                        >
                          Open
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
