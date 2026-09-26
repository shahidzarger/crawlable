import { authenticateLicense, fail } from '@/lib/api';
import { store } from '@/lib/db';
import { generateAll } from '@/lib/audit';
import { isCompleteFixKit } from '@/lib/audit/generators';
import {
  FIX_KIT_CONTENT_TYPES,
  GENERATED_FILE_NAMES,
  isGeneratedFileName,
} from '@/lib/audit/file-manifest';
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

// Both the whitelist and the served content types come from the manifest, so
// a new Fix Kit file is downloadable the moment it is generated.
const CONTENT_TYPES = FIX_KIT_CONTENT_TYPES;
const isGeneratedFile = isGeneratedFileName;

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

  /*
   * Regenerate unless the stored kit is COMPLETE, not merely present.
   *
   * `?? generateAll(...)` only covered a record with no generated files at
   * all. A record saved before sitemap.xml existed has a generated object with
   * four keys, which is truthy, so it was served as-is and the fifth file came
   * back undefined. Every audit run before that generator landed downloads
   * correctly now, because the shape is what decides.
   */
  const files = isCompleteFixKit(record.result.generated)
    ? record.result.generated
    : generateAll(record.result);

  const host = record.siteUrl.replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]/gi, '-');

  if (wantsZip) {
    // Driven off GENERATED_FILE_NAMES rather than the content-type map's key
    // order, so the archive contents are defined in one place.
    const archive = createZip(
      GENERATED_FILE_NAMES.map((name) => ({ name, content: files[name] })),
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
