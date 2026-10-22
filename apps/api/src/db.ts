import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/attention_span",
  // Hosted Postgres (Supabase) needs TLS; its pooler cert isn't in Node's CA list.
  ssl:
    process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  // Serverless: keep each function instance's pool small.
  max: process.env.VERCEL ? 3 : 10,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}

export type QueryFn = typeof query;

export async function withTransaction<T>(fn: (q: QueryFn) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const q: QueryFn = (text, params) => client.query(text, params);
  try {
    await client.query("BEGIN");
    const result = await fn(q);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
