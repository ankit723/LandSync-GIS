import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * Single pg connection pool, reused across Next.js hot reloads in dev.
 * Everything spatial is raw SQL against PostGIS; there is no ORM in the path.
 */
const g = globalThis as unknown as { __landstackPool?: Pool };

export const pool: Pool =
  g.__landstackPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PGPOOL_MAX ?? 12),
    idleTimeoutMillis: 30_000,
  });

if (!g.__landstackPool) {
  g.__landstackPool = pool;
  pool.on("error", (err) => {
    console.error("[pg] idle client error", err.message);
  });
}

export async function q<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(text, params as never[]);
  return res.rows;
}

export async function q1<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
