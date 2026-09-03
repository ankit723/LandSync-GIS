import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { buildCanonicalParcel } from "@/lib/integration/pipeline";
import { applyRbac } from "@/lib/rbac/filter";
import { parcelSummary } from "@/lib/integration/summary";
import { can } from "@/lib/rbac/matrix";
import { detectInconsistencies } from "@/lib/intelligence/inconsistency";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guard("view_public_data", id);
  if (!g.ok) return g.response;

  const assembly = await buildCanonicalParcel(id);
  if (!assembly) {
    return NextResponse.json({ error: `Parcel ${id} not found` }, { status: 404 });
  }

  const [profile, summary] = [
    applyRbac(assembly.parcel, g.user.role),
    await parcelSummary(id, g.user.role),
  ];

  let riskBadge: { riskLevel: string; requiresHumanVerification: boolean } | null = null;
  if (can(g.user.role, "view_risk")) {
    const r = detectInconsistencies(assembly.parcel, assembly.aux);
    riskBadge = { riskLevel: r.riskLevel, requiresHumanVerification: r.requiresHumanVerification };
  }

  return NextResponse.json({
    summary,
    profile,
    trace: assembly.trace,
    canonical: can(g.user.role, "view_ror") ? assembly.parcel : undefined,
    riskBadge,
  });
}
