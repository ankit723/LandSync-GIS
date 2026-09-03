import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/api/guard";
import { getSession } from "@/lib/auth/session";
import { runAllSyncs, runSync, listSyncRuns, deadLetterCount } from "@/lib/integration/sync";
import { deptApiReachable, deptApiBase } from "@/lib/integration/clients";

const body = z.object({
  source: z.enum(["REVENUE", "REGISTRATION", "MUNICIPAL", "PLANNING"]).optional(),
  full: z.boolean().optional(),
});

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [runs, deadLetters, reachable] = await Promise.all([
    listSyncRuns(20),
    deadLetterCount(),
    deptApiReachable(),
  ]);
  return NextResponse.json({
    departmentApi: { base: deptApiBase(), reachable },
    deadLetters,
    runs,
  });
}

export async function POST(req: Request) {
  const g = await guard("trigger_sync");
  if (!g.ok) return g.response;

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  if (!(await deptApiReachable())) {
    return NextResponse.json(
      { error: `Department API not reachable at ${deptApiBase()} — run "npm run dept:serve"` },
      { status: 503 },
    );
  }

  const results = parsed.data.source
    ? [await runSync(parsed.data.source, { full: parsed.data.full })]
    : await runAllSyncs({ full: parsed.data.full });

  return NextResponse.json({ results });
}
