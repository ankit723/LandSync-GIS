import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { detectChanges } from "@/lib/intelligence/change-detection";

export async function GET() {
  const g = await guard("view_change_detection");
  if (!g.ok) return g.response;

  const changes = await detectChanges();
  return NextResponse.json({
    epochs: { before: 2024, after: 2026 },
    count: changes.length,
    unauthorisedCount: changes.filter(
      (c) => c.finding === "POTENTIAL_UNAUTHORISED_CONSTRUCTION",
    ).length,
    changes,
  });
}
