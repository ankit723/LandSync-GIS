import "dotenv/config";
import { createServer } from "node:http";
import { Pool } from "pg";

/**
 * Mock departmental API gateway. Each of the four "government systems" exposes
 * its own records over HTTP from schema `dept.*`, with per-source API keys,
 * artificial latency, a configurable failure rate, and `?since=` incremental
 * pull. Land Stack's adapters call these — nothing reads `dept.*` directly.
 */
const PORT = Number(process.env.DEPT_PORT ?? 4000);
const FAILURE_RATE = Number(process.env.DEPT_FAILURE_RATE ?? 0);
const LATENCY_MS = Number(process.env.DEPT_LATENCY_MS ?? 60);

const SOURCES = ["revenue", "registration", "municipal", "planning"] as const;
type Source = (typeof SOURCES)[number];

function keyFor(s: Source): string {
  return (
    process.env[`DEPT_${s.toUpperCase()}_KEY`] ??
    process.env.DEPT_API_KEY ??
    "dept-dev-key"
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const send = (res: import("node:http").ServerResponse, code: number, body: unknown) => {
  const s = JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(s) });
  res.end(s);
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const parts = url.pathname.split("/").filter(Boolean); // [source, "records", maybeKey]

  if (parts[0] === "health") return send(res, 200, { ok: true, sources: SOURCES });

  const source = parts[0] as Source;
  if (!SOURCES.includes(source) || parts[1] !== "records") {
    return send(res, 404, { error: "not found" });
  }

  if (req.headers["x-api-key"] !== keyFor(source)) {
    return send(res, 401, { error: "bad or missing x-api-key" });
  }

  if (LATENCY_MS > 0) await new Promise((r) => setTimeout(r, Math.random() * LATENCY_MS));
  if (FAILURE_RATE > 0 && Math.random() < FAILURE_RATE) {
    return send(res, 503, { error: "upstream temporarily unavailable" });
  }

  try {
    // PATCH /:source/records/:parcelKey  — mutate a departmental record
    if (req.method === "PATCH" && parts[2]) {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const patch = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const existing = await pool.query<{ record: unknown }>(
        `SELECT record FROM dept.${source} WHERE parcel_key = $1`,
        [parts[2]],
      );
      if (!existing.rows.length) return send(res, 404, { error: "unknown parcel_key" });
      const current = existing.rows[0].record;
      const next = Array.isArray(current) ? patch : { ...(current as object), ...patch };
      await pool.query(`UPDATE dept.${source} SET record = $2 WHERE parcel_key = $1`, [
        parts[2],
        JSON.stringify(next),
      ]);
      return send(res, 200, { ok: true, parcel_key: parts[2], record: next });
    }

    // GET /:source/records?since=&limit=
    const since = url.searchParams.get("since");
    if (since && Number.isNaN(Date.parse(since))) {
      return send(res, 400, { error: `unparseable 'since': ${since}` });
    }
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 500), 2000);
    const params: unknown[] = [];
    let where = "";
    if (since) {
      params.push(since);
      where = `WHERE updated_at > $1::timestamptz`;
    }
    params.push(limit);
    const rows = await pool.query<{ parcel_key: string; record: unknown; updated_at: string }>(
      `SELECT parcel_key, record,
              to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
       FROM dept.${source} ${where}
       ORDER BY updated_at ASC
       LIMIT $${params.length}`,
      params,
    );
    const nextSince = rows.rows.length ? rows.rows[rows.rows.length - 1].updated_at : since;
    return send(res, 200, {
      source: source.toUpperCase(),
      count: rows.rows.length,
      next_since: nextSince,
      items: rows.rows.map((r) => ({
        canonical_parcel_id: r.parcel_key,
        updated_at: r.updated_at,
        record: r.record,
      })),
    });
  } catch (err) {
    return send(res, 500, { error: err instanceof Error ? err.message : "error" });
  }
});

server.listen(PORT, () => {
  console.log(`[dept-apis] listening on http://localhost:${PORT}`);
  console.log(`  sources: ${SOURCES.join(", ")}  ·  failureRate=${FAILURE_RATE} latency<=${LATENCY_MS}ms`);
});
