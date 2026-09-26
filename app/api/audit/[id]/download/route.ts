import { authenticateLicense, fail } from '@/lib/api';
import { store } from '@/lib/db';
import { generateAll } from '@/lib/audit';
import { createZip } from '@/lib/audit/zip';
import type { GeneratedFiles } from '@/lib/audit/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Download one generated fix file.
 *
 * Gated on the license that owns the audit — a shared report link lets a client
 * read the findings, but only the buyer can pull the files.
 */

const CONTENT_TYPES: Record<keyof GeneratedFiles, string> = {
  'robots.txt': 'text/plain; charset=utf-8',
  'sitemap.xml': 'application/xml; charset=utf-8',
  'llms.txt': 'text/markdown; charset=utf-8',
  'schema.jsonld': 'application/ld+json; charset=utf-8',
  'FIXES.md': 'text/markdown; charset=utf-8',
};

function isGeneratedFile(value: string): value is keyof GeneratedFiles {
  return value in CONTENT_TYPES;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const query = new URL(request.url).searchParams;
  const file = query.get('file') ?? '';
  // `?format=zip` returns the whole kit; `?file=<name>` returns one file.
  const wantsZip = query.get('format') === 'zip';

  if (!wantsZip && !isGeneratedFile(file)) {
    return fail(
      'invalid-file',
      `Unknown file. Choose one of: ${Object.keys(CONTENT_TYPES).join(', ')}, or pass format=zip.`,
      400,
    );
  }

  const authResult = await authenticateLicense(request);
  if ('response' in authResult) return authResult.response;
  const { keyHash } = authResult.auth;

  const db = await store();
  const record = await db.getAudit(id);

  if (!record) return fail('not-found', 'No report with that ID.', 404);
  if (record.mode !== 'audit') {
    return fail('scan-has-no-files', 'Free scans do not include generated files.', 403);
  }
  if (record.licenseKeyHash !== keyHash) {
    return fail('not-your-audit', 'This report belongs to a different license.', 403);
  }

  // Older records may predate a generator change, so regenerate on demand.
  const files = record.result.generated ?? generateAll(record.result);

  const host = record.siteUrl.replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]/gi, '-');

  if (wantsZip) {
    const archive = createZip(
      (Object.keys(CONTENT_TYPES) as Array<keyof GeneratedFiles>).map((name) => ({
        name,
        content: files[name],
      })),
    );

    return new Response(new Uint8Array(archive), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(archive.length),
        'Content-Disposition': `attachment; filename="${host}-crawlable-fix-kit.zip"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // Re-narrowed rather than cast: the earlier guard proved this, but only to a
  // reader. A cast here would survive someone later reordering the branches.
  if (!isGeneratedFile(file)) {
    return fail('invalid-file', 'Unknown file.', 400);
  }

  const body = files[file];

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': CONTENT_TYPES[file],
      'Content-Disposition': `attachment; filename="${host}-${file}"`,
      'Cache-Control': 'no-store',
    },
  });
}
