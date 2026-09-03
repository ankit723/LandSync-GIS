import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { resolveIdentifiers } from "@/lib/integration/pipeline";
import { parcelSummary } from "@/lib/integration/summary";
import { listParcelRows } from "@/lib/repo/parcels";

export async function GET(req: Request) {
  const g = await guard("search_parcel");
  if (!g.ok) return g.response;

  const url = new URL(req.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  if (!query) {
    const rows = (await listParcelRows()).slice(0, limit);
    const results = (
      await Promise.all(rows.map((p) => parcelSummary(p.canonicalParcelId, g.user.role)))
    ).filter(Boolean);
    return NextResponse.json({ query: "", count: results.length, results });
  }

  const resolved = (await resolveIdentifiers(query)).slice(0, limit);
  const results = (
    await Promise.all(
      resolved.map((r) => parcelSummary(r.canonicalParcelId, g.user.role, r.matchedOn)),
    )
  ).filter(Boolean);

  return NextResponse.json({
    query,
    count: results.length,
    resolvedVia: resolved.map((r) => ({ id: r.canonicalParcelId, matchedOn: r.matchedOn })),
    results,
  });
}
