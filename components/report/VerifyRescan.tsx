'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readStoredLicenseKey } from '@/lib/license-storage';
import { normaliseDomain } from '@/lib/domains';

/**
 * The verification step.
 *
 * This is the half of the product that distinguishes it from a one-off audit:
 * deploy the Fix Kit, press one button, and find out whether it worked. It
 * deliberately re-crawls the domain the report is already about rather than
 * offering a URL field — a re-scan is evidence about one site, and an input
 * box here would turn included verification scans into a way to audit
 * somebody else's site on the same allowance.
 */

interface Entitlement {
  scansRemaining: number;
  totalScansAllowed: number;
  expiresAt: string | null;
  windowClosed: boolean;
  domains: string[];
}

type State =
  | { phase: 'loading' }
  | { phase: 'anonymous' }
  | { phase: 'ready'; entitlement: Entitlement }
  | { phase: 'scanning'; entitlement: Entitlement }
  | { phase: 'done'; previousScore: number; newScore: number; auditId: string }
  | { phase: 'error'; message: string; entitlement: Entitlement | null };

function daysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt) - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function VerifyRescan({
  siteUrl,
  currentScore,
}: {
  siteUrl: string;
  currentScore: number;
}) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const domain = normaliseDomain(siteUrl);

  const load = useCallback(async () => {
    const key = readStoredLicenseKey();
    if (!key) {
      setState({ phase: 'anonymous' });
      return;
    }

    try {
      const response = await fetch('/api/audit', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!response.ok) {
        setState({ phase: 'anonymous' });
        return;
      }

      const payload = (await response.json()) as {
        license: {
          scansRemaining: number;
          totalScansAllowed: number;
          expiresAt: string | null;
          windowClosed: boolean;
        };
        domains: Array<{ domain: string }>;
      };

      setState({
        phase: 'ready',
        entitlement: {
          scansRemaining: payload.license.scansRemaining,
          totalScansAllowed: payload.license.totalScansAllowed,
          expiresAt: payload.license.expiresAt,
          windowClosed: payload.license.windowClosed,
          domains: payload.domains.map((entry) => entry.domain),
        },
      });
    } catch {
      setState({ phase: 'anonymous' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function rescan(entitlement: Entitlement) {
    setState({ phase: 'scanning', entitlement });
    const key = readStoredLicenseKey();

    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        // The same URL this report is about. Not user input.
        body: JSON.stringify({ url: siteUrl, notify: false }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { audit: { id: string; score: number } }
        | { error: string }
        | null;

      if (!response.ok || !payload || 'error' in payload) {
        setState({
          phase: 'error',
          message:
            payload && 'error' in payload
              ? payload.error
              : 'The re-scan could not be completed.',
          entitlement,
        });
        return;
      }

      setState({
        phase: 'done',
        previousScore: currentScore,
        newScore: payload.audit.score,
        auditId: payload.audit.id,
      });
    } catch {
      setState({
        phase: 'error',
        message: 'Could not reach the server. Your scan was not used.',
        entitlement,
      });
    }
  }

  // Nothing is shown to a visitor with no licence: this panel is about an
  // entitlement they do not have, and an upsell here would be noise on a
  // report they were sent a link to.
  if (state.phase === 'loading' || state.phase === 'anonymous') return null;

  if (state.phase === 'done') {
    return <DeltaCard {...state} siteUrl={siteUrl} />;
  }

  const entitlement =
    state.phase === 'error' ? state.entitlement : state.entitlement;
  if (!entitlement) return null;

  const { scansRemaining, totalScansAllowed, expiresAt, windowClosed, domains } =
    entitlement;

  const registered = domain !== null && domains.includes(domain);
  const remaining = daysLeft(expiresAt);
  const scanning = state.phase === 'scanning';

  if (windowClosed) {
    return (
      <Panel tone="muted" heading="Your verification window has closed">
        <p>
          The scans on this licence expired
          {expiresAt ? ` on ${expiresAt.slice(0, 10)}` : ''}. The report and your
          Fix Kit stay available — only new scans need a fresh licence.
        </p>
        <Link href="/#pricing" className="btn-primary mt-4 inline-block px-5 py-2.5 text-sm">
          Get more scans
        </Link>
      </Panel>
    );
  }

  if (scansRemaining <= 0) {
    return (
      <Panel tone="muted" heading="No verification scans left">
        <p>
          All {totalScansAllowed} scans on this licence are used. Your report and Fix Kit
          stay available.
        </p>
        <Link href="/#pricing" className="btn-primary mt-4 inline-block px-5 py-2.5 text-sm">
          Get more scans
        </Link>
      </Panel>
    );
  }

  if (!registered) {
    return (
      <Panel tone="muted" heading="This report is on a different licence">
        <p>
          {domain ?? 'This domain'} is not registered to the licence stored in this browser,
          so a re-scan would need a free domain slot.
        </p>
        <Link href="/dashboard" className="btn-ghost mt-4 inline-block px-5 py-2.5 text-sm">
          Open the dashboard
        </Link>
      </Panel>
    );
  }

  return (
    <Panel
      tone="action"
      heading={`Re-Scan to Verify Fixes (${scansRemaining} verification scan${
        scansRemaining === 1 ? '' : 's'
      } remaining)`}
    >
      <p>
        Deploy the Fix Kit files, then re-crawl <strong>{domain}</strong> to see what
        changed. You get a before-and-after score, not just a new number.
      </p>

      {state.phase === 'error' ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--data-bad)' }}
        >
          {state.message}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => void rescan(entitlement)}
          disabled={scanning}
          aria-busy={scanning}
          className="btn-primary px-5 py-2.5 text-sm"
        >
          {scanning ? 'Re-scanning…' : 'Re-scan and verify'}
        </button>
        <p className="text-xs ink-muted">
          Uses one of your {scansRemaining} remaining scans
          {remaining !== null ? ` · window closes in ${remaining} day${remaining === 1 ? '' : 's'}` : ''}
          . Takes about a minute.
        </p>
      </div>
    </Panel>
  );
}

function DeltaCard({
  previousScore,
  newScore,
  auditId,
  siteUrl,
}: {
  previousScore: number;
  newScore: number;
  auditId: string;
  siteUrl: string;
}) {
  const delta = newScore - previousScore;
  const improved = delta > 0;
  const unchanged = delta === 0;

  /*
   * A flat or falling score is reported as plainly as a rising one.
   *
   * The temptation is to celebrate every re-scan, but the whole value of a
   * verification scan is that it can say no. A customer who deploys the files
   * and sees "no change" needs to know that, not a green tick.
   */
  const tone = improved ? 'var(--data-good)' : unchanged ? 'var(--data-warn)' : 'var(--data-bad)';

  return (
    <section className="surface-card p-6" style={{ borderColor: tone }}>
      <h2 className="text-lg font-semibold tracking-tight">
        {improved
          ? `Score improved from ${previousScore} → ${newScore}`
          : unchanged
            ? `Score unchanged at ${newScore}`
            : `Score fell from ${previousScore} → ${newScore}`}
      </h2>

      <div className="mt-4 flex items-end gap-6">
        <Figure label="Before" value={previousScore} />
        <span aria-hidden className="pb-2 text-2xl ink-muted">
          →
        </span>
        <Figure label="After" value={newScore} colour={tone} />
        <div className="pb-1">
          <span className="font-mono text-sm tabular-nums" style={{ color: tone }}>
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed ink-secondary">
        {improved
          ? 'The fixes landed. The new report lists what is still outstanding.'
          : unchanged
            ? `Nothing measurable changed on ${new URL(siteUrl).host}. Check that the files are live at the paths in FIXES.md — a Fix Kit sitting in a repo scores the same as no Fix Kit.`
            : 'Something regressed since the last crawl. Open the new report to see which checks moved.'}
      </p>

      <Link href={`/audit/${auditId}`} className="btn-primary mt-5 inline-block px-5 py-2.5 text-sm">
        Open the new report
      </Link>
    </section>
  );
}

function Figure({ label, value, colour }: { label: string; value: number; colour?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider ink-muted">{label}</p>
      <p
        className="font-mono text-4xl font-semibold tabular-nums"
        style={colour ? { color: colour } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function Panel({
  tone,
  heading,
  children,
}: {
  tone: 'action' | 'muted';
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="surface-card p-6"
      style={tone === 'action' ? { borderColor: 'var(--accent)' } : undefined}
    >
      <h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
      <div className="mt-2 text-sm leading-relaxed ink-secondary">{children}</div>
    </section>
  );
}
