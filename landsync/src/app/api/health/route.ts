import { NextResponse } from "next/server";
import { q1 } from "@/lib/db/pool";
import { cacheBackend } from "@/lib/db/cache";
import { llmInfo } from "@/lib/ai/llm";

export async function GET() {
  const checks: Record<string, unknown> = {};
  let ok = true;

  try {
    const row = await q1<{ n: string; postgis: string }>(
      `SELECT (SELECT count(*)::text FROM parcels) AS n, postgis_version() AS postgis`,
    );
    checks.database = { ok: true, parcels: Number(row?.n ?? 0), postgis: row?.postgis };
  } catch (err) {
    ok = false;
    checks.database = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  checks.cache = { backend: cacheBackend() };
  checks.llm = llmInfo();

  return NextResponse.json({ ok, service: "landsync", ...checks }, { status: ok ? 200 : 503 });
}
