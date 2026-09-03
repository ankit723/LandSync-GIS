import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { buildCanonicalParcel } from "@/lib/integration/pipeline";
import { detectInconsistencies } from "@/lib/intelligence/inconsistency";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guard("view_risk", id);
  if (!g.ok) return g.response;

  const assembly = await buildCanonicalParcel(id);
  if (!assembly) {
    return NextResponse.json({ error: `Parcel ${id} not found` }, { status: 404 });
  }
  return NextResponse.json(detectInconsistencies(assembly.parcel, assembly.aux));
}
