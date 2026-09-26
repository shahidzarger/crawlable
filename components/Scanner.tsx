'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AuditResult } from '@/lib/audit/types';
import { prioritisedFindings } from '@/lib/audit/scoring';
import { ScoreHero } from '@/components/report/ScoreHero';
import { SEVERITY, scoreColor } from '@/components/report/severity';

/**
 * The interactive demo.
 *
 * This is the whole top of the funnel: a visitor types a domain and gets a real
 * measurement of their own site in about twenty seconds. It shows the genuine
 * findings — nothing is held back to manufacture urgency — and stops short only
 * of the generated fix files, which are the paid deliverable.
 */

type State =
  | { phase: 'idle' }
  | { phase: 'scanning' }
  | { phase: 'done'; result: AuditResult }
  | { phase: 'error'; message: string };

const STEPS = [
  'Resolving host',
  'Fetching raw HTML',
  'Reading robots.txt',
  'Checking llms.txt',
  'Scoring readability',
];

export function Scanner() {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<State>({ phase: 'idle' });
  const [step, setStep] = useState(0);

  async function scan(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    setState({ phase: 'scanning' });
    setStep(0);

    const ticker = setInterval(() => {
      setStep((current) => Math.min(current + 1, STEPS.length - 1));
    }, 1400);

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });

      const payload = (await response.json()) as
        | { scan: AuditResult }
        | { error: string; code: string };

      if (!response.ok || 'error' in payload) {
        setState({
          phase: 'error',
          message: 'error' in payload ? payload.error : 'The scan failed.',
        });
        return;
      }

      setState({ phase: 'done', result: payload.scan });
    } catch {
      setState({
        phase: 'error',
        message: 'Could not reach the scanner. Check your connection and try again.',
      });
    } finally {
      clearInterval(ticker);
    }
  }

  return (
    <div id="scan" className="scroll-mt-20">
      <form onSubmit={scan} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="scan-url" className="sr-only">
          Your website address
        </label>
        <input
          id="scan-url"
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="yourdomain.com"
          className="field flex-1 px-4 py-3 text-base outline-none"
          disabled={state.phase === 'scanning'}
        />
        <button
          type="submit"
          className="btn-primary px-6 py-3 text-base"
          disabled={state.phase === 'scanning' || url.trim().length === 0}
        >
          {state.phase === 'scanning' ? 'Scanning…' : 'Scan free'}
        </button>
      </form>

      <p className="mt-3 text-xs ink-muted">
        One page, no signup, about twenty seconds. We fetch your HTML exactly as GPTBot would.
      </p>

      {state.phase === 'scanning' ? <ScanProgress step={step} /> : null}

      {state.phase === 'error' ? (
        <div
          role="alert"
          className="mt-6 rounded-xl border p-4 text-sm"
          style={{ borderColor: 'var(--data-bad)' }}
        >
          <span aria-hidden style={{ color: 'var(--data-bad)' }}>
            {SEVERITY.critical.icon}{' '}
          </span>
          {state.message}
        </div>
      ) : null}

      {state.phase === 'done' ? <ScanResult result={state.result} /> : null}
    </div>
  );
}

function ScanProgress({ step }: { step: number }) {
  return (
    <div className="mt-6 surface-card p-5">
      <div
        className="relative h-1 overflow-hidden rounded-full"
        style={{ background: 'var(--surface-sunken)' }}
      >
        <div
          className="absolute inset-y-0 w-1/3 animate-sweep rounded-full"
          style={{ background: 'var(--accent)' }}
        />
      </div>
      <ul className="mt-4 space-y-1.5 text-sm" aria-live="polite">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className="flex items-center gap-2"
            style={{
              color: index <= step ? 'var(--ink-primary)' : 'var(--ink-muted)',
            }}
          >
            <span aria-hidden style={{ color: index < step ? 'var(--data-good)' : undefined }}>
              {index < step ? '✓' : index === step ? '›' : '·'}
            </span>
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScanResult({ result }: { result: AuditResult }) {
  const findings = prioritisedFindings(result.checks)
    .filter((item) => item.severity !== 'pass')
    .slice(0, 4);

  const page = result.pages[0];

  return (
    <div className="mt-8 space-y-4 animate-fade-up">
      <ScoreHero
        score={result.score}
        grade={result.grade}
        invisiblePercent={result.invisiblePercent}
        pagesAudited={result.pagesAudited}
        pagesSkipped={result.pagesSkipped}
        siteUrl={result.siteUrl}
      />

      {page && !page.error ? (
        <div className="surface-card p-5">
          <h3 className="text-sm font-semibold">What a crawler read on this page</h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs ink-muted">Readable words</dt>
              <dd className="font-semibold tabular-nums">
                {page.rawWordCount.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs ink-muted">Text of document</dt>
              <dd className="font-semibold tabular-nums">
                {(page.textToHtmlRatio * 100).toFixed(1)}%
              </dd>
            </div>
            <div>
              <dt className="text-xs ink-muted">Schema blocks</dt>
              <dd className="font-semibold tabular-nums">{page.schemaTypes.length}</dd>
            </div>
            <div>
              <dt className="text-xs ink-muted">Framework</dt>
              <dd className="font-semibold">{page.framework ?? 'Not detected'}</dd>
            </div>
          </dl>
          {page.spaSignals.length > 0 ? (
            <p className="mt-3 text-sm" style={{ color: 'var(--data-bad)' }}>
              <span aria-hidden>{SEVERITY.critical.icon} </span>
              {page.spaSignals[0]}
            </p>
          ) : null}
        </div>
      ) : null}

      {findings.length > 0 ? (
        <div className="surface-card p-5">
          <h3 className="text-sm font-semibold">Top findings on this page</h3>
          <ul className="mt-3 space-y-3">
            {findings.map((item) => {
              const style = SEVERITY[item.severity];
              return (
                <li key={item.id} className="flex gap-2.5 text-sm">
                  <span aria-hidden className="mt-0.5" style={{ color: style.color }}>
                    {style.icon}
                  </span>
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-0.5 ink-secondary">{item.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div
        className="surface-card p-5"
        style={{ borderColor: 'var(--border-strong)' }}
      >
        <h3 className="font-semibold">
          That was one page. Your site has more.
        </h3>
        <p className="mt-1.5 text-sm ink-secondary">
          A full audit crawls up to 40 pages, tells you which ones AI crawlers cannot read, and
          generates your <code className="font-mono text-xs">llms.txt</code>,{' '}
          <code className="font-mono text-xs">robots.txt</code> and the JSON-LD you are missing —
          ready to paste.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link href="/#pricing" className="btn-primary px-5 py-2.5 text-sm">
            Run the full audit — $29
          </Link>
          <span className="text-xs ink-muted">
            Score {result.score}/100 on this page ·{' '}
            <span style={{ color: scoreColor(result.score) }}>grade {result.grade}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
