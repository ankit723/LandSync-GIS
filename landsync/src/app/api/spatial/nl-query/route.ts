import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/api/guard";
import { interpretNlQuery } from "@/lib/intelligence/nl-query";
import { runSpatialQuery } from "@/lib/repo/spatial";
import { appendAudit } from "@/lib/audit/log";
import { llmInfo } from "@/lib/ai/llm";

const schema = z.object({ query: z.string().min(3).max(400) });

export async function POST(req: Request) {
  const g = await guard("run_nl_query");
  if (!g.ok) return g.response;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "query string required" }, { status: 400 });
  }

  const nl = await interpretNlQuery(parsed.data.query);
  const result = nl.ok ? await runSpatialQuery(nl.filters) : null;

  await appendAudit(g.user, {
    action: "NL_SPATIAL_QUERY",
    resourceType: "QUERY",
    resourceId: parsed.data.query.slice(0, 80),
    newData: { method: nl.method, filters: nl.filters, count: result?.count ?? 0 },
    outcome: "SUCCESS",
  }).catch(() => {});

  return NextResponse.json({
    input: parsed.data.query,
    parsed: nl,
    result,
    engine: llmInfo(),
  });
}
