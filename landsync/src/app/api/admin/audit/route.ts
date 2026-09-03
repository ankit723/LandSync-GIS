import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { listAudit } from "@/lib/audit/log";

export async function GET(req: Request) {
  const g = await guard("view_audit");
  if (!g.ok) return g.response;
  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 200), 500);
  return NextResponse.json({ events: await listAudit(limit) });
}
