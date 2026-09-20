import { siteUrl } from '@/lib/env';
import type { AuditResult } from '@/lib/audit/types';
import type { Plan } from '@/lib/plans';

/**
 * Transactional email templates.
 *
 * Plain HTML with inline styles — email clients strip <style> blocks and have
 * no flexbox worth relying on. Every template also ships a text/plain version,
 * which is what raises deliverability on a new sending domain.
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const BRAND = '#3ddc97';
const INK = '#0d0f14';

function shell(body: string, preheader: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Crawlable</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e6ea;">
<tr><td style="background:${INK};padding:20px 28px;">
<span style="color:${BRAND};font-size:18px;font-weight:700;letter-spacing:-0.02em;">Crawlable</span>
<span style="color:#98a1b2;font-size:13px;margin-left:10px;">AI readability audits</span>
</td></tr>
<tr><td style="padding:28px;color:#1f2430;font-size:15px;line-height:1.6;">
${body}
</td></tr>
<tr><td style="padding:18px 28px;background:#fafbfc;border-top:1px solid #e4e6ea;color:#6b7689;font-size:12px;line-height:1.5;">
Crawlable &middot; <a href="${siteUrl()}" style="color:#6b7689;">${siteUrl().replace(/^https?:\/\//, '')}</a><br>
You are receiving this because you bought or ran an audit. <a href="${siteUrl()}/unsubscribe" style="color:#6b7689;">Unsubscribe</a>.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
<tr><td style="background:${INK};border-radius:8px;">
<a href="${href}" style="display:inline-block;padding:12px 22px;color:${BRAND};font-weight:600;font-size:15px;text-decoration:none;">${label}</a>
</td></tr></table>`;
}

/** Sent immediately after a successful purchase, carrying the license key. */
export function purchaseEmail(params: {
  licenseKey: string;
  plan: Plan;
}): EmailContent {
  const { licenseKey, plan } = params;
  const dashboard = `${siteUrl()}/dashboard`;
  const quota =
    plan.auditQuota === null ? 'Unlimited audits' : `${plan.auditQuota} audit${plan.auditQuota === 1 ? '' : 's'}`;

  const html = shell(
    `<p style="margin:0 0 16px;">Your <strong>${plan.name}</strong> is active. ${quota}, ready to run.</p>
<p style="margin:0 0 8px;color:#6b7689;font-size:13px;">Your license key</p>
<div style="background:#f4f5f7;border:1px solid #e4e6ea;border-radius:8px;padding:14px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;word-break:break-all;color:${INK};">${licenseKey}</div>
${button(dashboard, 'Run your first audit')}
<p style="margin:0 0 12px;"><strong>What happens next.</strong> Paste the key into the dashboard, enter a site, and the audit crawls up to 40 pages the way a non-rendering AI crawler does. It takes about a minute.</p>
<p style="margin:0 0 12px;">You get back a prioritised fix list plus three files to paste: <code style="background:#f4f5f7;padding:2px 5px;border-radius:4px;">llms.txt</code>, a rewritten <code style="background:#f4f5f7;padding:2px 5px;border-radius:4px;">robots.txt</code>, and the JSON-LD your pages are missing.</p>
<p style="margin:0;color:#6b7689;font-size:13px;">Keep this email — it is the only copy of your key we send.</p>`,
    `Your Crawlable license key is inside. ${quota}.`,
  );

  const text = `Your ${plan.name} is active. ${quota}, ready to run.

License key: ${licenseKey}

Run your first audit: ${dashboard}

Paste the key into the dashboard, enter a site, and the audit crawls up to 40 pages the way a non-rendering AI crawler does. You get a prioritised fix list plus llms.txt, robots.txt and JSON-LD files to paste.

Keep this email — it is the only copy of your key we send.

Crawlable — ${siteUrl()}`;

  return {
    subject: `Your Crawlable license key (${plan.name})`,
    html,
    text,
  };
}

/** Sent when an audit finishes, with the headline finding. */
export function auditReadyEmail(params: {
  result: AuditResult;
  brandName?: string | null;
}): EmailContent {
  const { result, brandName } = params;
  const host = result.siteUrl.replace(/^https?:\/\//, '');
  const reportUrl = `${siteUrl()}/audit/${result.id}`;
  const from = brandName ?? 'Crawlable';

  const headline =
    result.invisiblePercent > 0
      ? `${result.invisiblePercent}% of the pages we checked are invisible to AI crawlers.`
      : 'Every page we checked is readable without JavaScript.';

  const criticals = result.checks
    .flatMap((check) => check.findings)
    .filter((f) => f.severity === 'critical');

  const html = shell(
    `<p style="margin:0 0 16px;">The audit of <strong>${host}</strong> is ready.</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;">
<tr>
<td style="background:#f4f5f7;border-radius:8px;padding:16px;text-align:center;width:50%;">
<div style="font-size:30px;font-weight:700;color:${INK};line-height:1;">${result.score}</div>
<div style="font-size:12px;color:#6b7689;margin-top:4px;">Score out of 100 &middot; grade ${result.grade}</div>
</td>
<td style="width:12px;"></td>
<td style="background:#f4f5f7;border-radius:8px;padding:16px;text-align:center;width:50%;">
<div style="font-size:30px;font-weight:700;color:${result.invisiblePercent > 0 ? '#d94f4f' : INK};line-height:1;">${result.invisiblePercent}%</div>
<div style="font-size:12px;color:#6b7689;margin-top:4px;">Invisible to AI crawlers</div>
</td>
</tr>
</table>
<p style="margin:0 0 16px;">${headline}</p>
${
  criticals.length > 0
    ? `<p style="margin:0 0 8px;font-weight:600;">Fix these first:</p><ul style="margin:0 0 16px;padding-left:20px;color:#1f2430;">${criticals
        .slice(0, 3)
        .map((f) => `<li style="margin-bottom:6px;">${f.title}</li>`)
        .join('')}</ul>`
    : ''
}
${button(reportUrl, 'Open the full report')}
<p style="margin:0;color:#6b7689;font-size:13px;">The report includes your generated llms.txt, robots.txt and JSON-LD, ready to download.</p>`,
    headline,
  );

  const text = `The audit of ${host} is ready.

Score: ${result.score}/100 (grade ${result.grade})
Invisible to AI crawlers: ${result.invisiblePercent}%

${headline}
${criticals.length > 0 ? `\nFix these first:\n${criticals.slice(0, 3).map((f) => `- ${f.title}`).join('\n')}\n` : ''}
Open the full report: ${reportUrl}

${from} — ${siteUrl()}`;

  return {
    subject: `${host}: ${result.score}/100 AI readability${result.invisiblePercent > 0 ? ` — ${result.invisiblePercent}% invisible` : ''}`,
    html,
    text,
  };
}

/** Day-2 follow-up for buyers who have not run an audit yet. */
export function nudgeEmail(params: { licenseTail: string }): EmailContent {
  const dashboard = `${siteUrl()}/dashboard`;

  const html = shell(
    `<p style="margin:0 0 16px;">Your license (ending <strong>${params.licenseTail}</strong>) has not been used yet.</p>
<p style="margin:0 0 16px;">The audit takes about a minute and needs nothing but the domain. If you are not sure which site to start with, start with the one you would most want an AI to recommend.</p>
${button(dashboard, 'Run your audit')}
<p style="margin:0 0 12px;"><strong>One thing worth knowing.</strong> With the exception of Google's crawlers, AI crawlers do not execute JavaScript. If your site renders client-side, the content you are proud of may not exist as far as they are concerned — and the audit will tell you exactly which pages.</p>
<p style="margin:0;color:#6b7689;font-size:13px;">Reply to this email if anything is unclear. It reaches a person.</p>`,
    'Your Crawlable audit is waiting.',
  );

  const text = `Your license (ending ${params.licenseTail}) has not been used yet.

The audit takes about a minute and needs nothing but the domain.

Run your audit: ${dashboard}

With the exception of Google's crawlers, AI crawlers do not execute JavaScript. If your site renders client-side, the content you are proud of may not exist as far as they are concerned.

Reply to this email if anything is unclear.

Crawlable — ${siteUrl()}`;

  return { subject: 'Your Crawlable audit is still waiting', html, text };
}

/** Sent after a free scan, offering the full audit. */
export function scanFollowUpEmail(params: {
  siteUrl: string;
  score: number;
  invisiblePercent: number;
}): EmailContent {
  const host = params.siteUrl.replace(/^https?:\/\//, '');
  const pricing = `${siteUrl()}/#pricing`;

  const html = shell(
    `<p style="margin:0 0 16px;">You scanned <strong>${host}</strong> and it came back at <strong>${params.score}/100</strong>.</p>
<p style="margin:0 0 16px;">That scan looked at one page. A full audit crawls up to 40, finds which of them AI crawlers cannot read, and generates the files that fix it.</p>
${button(pricing, 'See what a full audit covers')}
<p style="margin:0;color:#6b7689;font-size:13px;">No account needed — you get a license key by email and paste it into the dashboard.</p>`,
    `${host} scored ${params.score}/100.`,
  );

  const text = `You scanned ${host} and it came back at ${params.score}/100.

That scan looked at one page. A full audit crawls up to 40, finds which of them AI crawlers cannot read, and generates the files that fix it.

See what a full audit covers: ${pricing}

Crawlable — ${siteUrl()}`;

  return { subject: `${host} scored ${params.score}/100 for AI readability`, html, text };
}
