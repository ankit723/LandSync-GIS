import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/rbac/matrix";
import { anomalyRegister } from "@/lib/intelligence/registry";
import { integrationHealth } from "@/lib/integration/health";
import { parcelClassCounts, tableCounts } from "@/lib/repo/parcels";
import { layerFeatureCounts } from "@/lib/repo/layers";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [byClassification, counts, layers, health] = await Promise.all([
    parcelClassCounts(),
    tableCounts(),
    layerFeatureCounts(),
    integrationHealth(),
  ]);

  const base = {
    parcelsTotal: counts.parcels ?? 0,
    byClassification,
    identifiersMapped: counts.parcel_identifiers ?? 0,
    adapters: health.map((h) => ({
      source: h.sourceSystem,
      status: h.status,
      ok: h.ok,
      errors: h.errors,
    })),
    layers,
  };

  if (!can(user.role, "view_risk")) {
    return NextResponse.json({ ...base, risk: null });
  }

  const rows = await anomalyRegister();
  const byLevel: Record<string, number> = {};
  for (const r of rows) byLevel[r.riskLevel] = (byLevel[r.riskLevel] ?? 0) + 1;

  return NextResponse.json({
    ...base,
    risk: {
      flaggedTotal: rows.length,
      byLevel,
      requiresVerification: rows.filter((r) => r.requiresHumanVerification).length,
      top: rows.slice(0, 8),
    },
  });
}
