import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { anomalyRegister } from "@/lib/intelligence/registry";

export async function GET(req: Request) {
  const g = await guard("view_risk");
  if (!g.ok) return g.response;

  const level = new URL(req.url).searchParams.get("level");
  let rows = await anomalyRegister();
  if (level) rows = rows.filter((r) => r.riskLevel === level.toUpperCase());
  return NextResponse.json({ count: rows.length, rows });
}
