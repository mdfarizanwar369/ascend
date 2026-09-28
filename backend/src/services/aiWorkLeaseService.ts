import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { PoolClient } from "pg";
import { pool, query, withQueryClient } from "../db/pool";

export class AiWorkBusyError extends Error {
  status = 429;
  constructor() {
    super("Zoe is already working or temporarily busy. Please try again in a moment.");
    this.name = "AiWorkBusyError";
  }
}

type Lease = { token: string; resource: string; lost: boolean };
const activeLeases = new AsyncLocalStorage<Lease[]>();
const LEASE_SECONDS = 300;

async function acquire(resource: string, capacity: number): Promise<Lease> {
  const token = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '2s'");
    // Serialize only the short reservation, never the provider request.
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`ai-work:${resource}`]);
    await client.query("delete from ai_work_leases where resource=$1 and expires_at <= clock_timestamp()", [resource]);
    const result = await client.query<{ token: string }>(`
      insert into ai_work_leases (token, resource, expires_at)
      select $1, $2, clock_timestamp() + ($3 * interval '1 second')
      where (select count(*) from ai_work_leases where resource=$2) < $4
      returning token`, [token, resource, LEASE_SECONDS, capacity]);
    if (!result.rows.length) throw new AiWorkBusyError();
    await client.query("commit");
    return { token, resource, lost: false };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if ((error as { code?: string }).code === "55P03") throw new AiWorkBusyError();
    throw error;
  } finally {
    client.release();
  }
}

export async function assertAiWorkOwnership(client: PoolClient) {
  const leases = activeLeases.getStore() ?? [];
  for (const lease of leases) {
    if (lease.lost) throw new AiWorkBusyError();
    const result = await client.query(`select token from ai_work_leases
      where token=$1 and resource=$2 and expires_at > clock_timestamp() for update`, [lease.token, lease.resource]);
    if (!result.rows.length) throw new AiWorkBusyError();
  }
}

// Fence completed writes against an expired/replaced worker using the same transaction.
export async function withAiWorkTransaction<T>(work: () => Promise<T>): Promise<T> {
  if (!(activeLeases.getStore()?.length)) return work();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await assertAiWorkOwnership(client);
    const result = await withQueryClient(client, work);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function withAiWorkLease<T>(resource: string, work: () => Promise<T>, capacity = 1): Promise<T> {
  const current = activeLeases.getStore() ?? [];
  if (current.some(lease => lease.resource === resource)) return work();
  const lease = await acquire(resource, capacity);
  let renewing: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (renewing || lease.lost) return;
    renewing = query(`update ai_work_leases set expires_at=clock_timestamp() + ($2 * interval '1 second')
      where token=$1 and expires_at > clock_timestamp()`, [lease.token, LEASE_SECONDS])
      .then(result => { if (!result.rowCount) lease.lost = true; })
      .catch(() => { lease.lost = true; })
      .finally(() => { renewing = undefined; });
  }, 30_000);
  timer.unref();
  try {
    return await activeLeases.run([...current, lease], work);
  } finally {
    clearInterval(timer);
    await renewing;
    await query("delete from ai_work_leases where token=$1", [lease.token]).catch(() => {
      // Expiry permits recovery after a database/network failure without exposing user IDs.
      console.error("[ai-work] reservation cleanup deferred to expiry");
    });
  }
}

// Bound local waiting as well as active provider work. Database leases enforce the
// same active limit across instances; rejected arrivals do not occupy DB connections.
export function createAiProviderGate(capacity: number, queueLimit = 24, waitMs = 10_000) {
  let active = 0;
  const waiting: Array<() => void> = [];
  async function enter() {
    if (active < capacity) { active++; return; }
    if (waiting.length >= queueLimit) throw new AiWorkBusyError();
    await new Promise<void>((resolve, reject) => {
      const grant = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => {
        const index = waiting.indexOf(grant);
        if (index >= 0) waiting.splice(index, 1);
        reject(new AiWorkBusyError());
      }, waitMs);
      waiting.push(grant);
    });
  }
  return async function run<T>(resource: string, work: () => Promise<T>) {
    await enter();
    try { return await withAiWorkLease(resource, work, capacity); }
    finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
