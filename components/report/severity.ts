import type { Severity } from '@/lib/audit/types';

/**
 * Severity presentation.
 *
 * Status colour is never the only signal: every use pairs the colour with an
 * icon glyph and the severity word, so the meaning survives colour blindness,
 * greyscale printing and forced-colors mode.
 */

export interface SeverityStyle {
  /** CSS custom property holding the validated status colour. */
  color: string;
  icon: string;
  label: string;
  /** Short imperative used in list headers. */
  action: string;
}

export const SEVERITY: Record<Severity, SeverityStyle> = {
  critical: {
    color: 'var(--data-bad)',
    icon: '▲',
    label: 'Critical',
    action: 'Fix first',
  },
  warning: {
    color: 'var(--data-warn)',
    icon: '◆',
    label: 'Warning',
    action: 'Worth fixing',
  },
  info: {
    color: 'var(--ink-muted)',
    icon: '●',
    label: 'Info',
    action: 'Nice to have',
  },
  pass: {
    color: 'var(--data-good)',
    icon: '✓',
    label: 'Pass',
    action: 'No action',
  },
};

/** Colour for a 0-100 score, using the same reserved status palette. */
export function scoreColor(score: number): string {
  if (score >= 75) return 'var(--data-good)';
  if (score >= 50) return 'var(--data-warn)';
  return 'var(--data-bad)';
}

export function scoreVerdict(score: number): string {
  if (score >= 90) return 'AI crawlers read this site well.';
  if (score >= 75) return 'Mostly readable, with fixable gaps.';
  if (score >= 60) return 'Readable in parts. Real content is being lost.';
  if (score >= 40) return 'Substantial content is invisible to AI crawlers.';
  return 'AI crawlers get almost nothing from this site.';
}
