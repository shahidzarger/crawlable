import { fail, ok } from '@/lib/api';
import { store } from '@/lib/db';
import { redactForFreeScan } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Fetch a stored audit by ID.
 *
 * Report IDs are v4 UUIDs, which makes the URL an unguessable capability — a
 * customer can share a report link with a client without either party needing
 * an account. Free scans are redacted on read as well as on write.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return fail('invalid-id', 'That is not a valid report ID.', 400);
  }

  const db = await store();
  const record = await db.getAudit(id);

  if (!record) {
    return fail('not-found', 'No report with that ID. It may have expired.', 404);
  }

  const result =
    record.mode === 'scan' ? redactForFreeScan(record.result) : record.result;

  return ok({ audit: result });
}
