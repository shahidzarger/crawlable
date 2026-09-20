import { env } from '@/lib/env';
import { MemoryStore } from './memory';
import { PostgresStore } from './postgres';
import type { Store } from './types';

export * from './types';
export { MIGRATION_SQL } from './postgres';

/**
 * Store selection.
 *
 * DATABASE_URL present → Postgres. Absent → in-memory, so `npm run dev` works
 * on a clean checkout with no services running. The health endpoint reports
 * which one is live so an accidental memory-store deploy is visible.
 */

let instance: Store | null = null;
let initPromise: Promise<void> | null = null;

export function storeKind(): 'postgres' | 'memory' {
  return env().DATABASE_URL ? 'postgres' : 'memory';
}

export function getStore(): Store {
  if (instance) return instance;
  const url = env().DATABASE_URL;
  instance = url ? new PostgresStore(url) : new MemoryStore();
  return instance;
}

/** Get the store with its schema guaranteed to exist. Idempotent and cached. */
export async function store(): Promise<Store> {
  const current = getStore();
  if (!initPromise) {
    initPromise = current.init().catch((error: unknown) => {
      // Reset so the next request retries rather than caching a failure.
      initPromise = null;
      throw error;
    });
  }
  await initPromise;
  return current;
}

/** Replace the active store. Tests only. */
export function __setStore(next: Store | null): void {
  instance = next;
  initPromise = null;
}
