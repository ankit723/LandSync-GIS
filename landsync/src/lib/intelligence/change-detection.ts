import { q } from "@/lib/db/pool";

export interface DetectedChange {
  parcelId: string;
  changeType: "NEW_STRUCTURE" | "BUILT_UP_AREA_INCREASE";
  builtAreaBefore: number;
  builtAreaAfter: number;
  deltaArea: number;
  permitStatus: string;
  finding: "POTENTIAL_UNAUTHORISED_CONSTRUCTION" | "CONSISTENT_WITH_PERMIT" | "REVIEW";
  note: string;
}

const PERMIT_MAP: Record<string, string> = {
  SANCTIONED: "APPROVED",
  APPLIED: "PENDING",
  REFUSED: "REJECTED",
  NONE: "NOT_FOUND",
};

/**
 * Two-epoch change detection (2024 → 2026). Built-up area per parcel per year is
 * computed in PostGIS (`ST_Area` on the footprint geometry, geography cast for m²)
 * then cross-checked against the municipal building-permission record.
 * (PRD FR-11, §13.3)
 */
export async function detectChanges(): Promise<DetectedChange[]> {
  const rows = await q<{
    id: string;
    c24: number;
    a24: number;
    c26: number;
    a26: number;
    permit_state: string | null;
  }>(`
    WITH b AS (
      SELECT canonical_parcel_id AS id, year,
             count(*)::int AS cnt,
             round(sum(ST_Area(geom::geography))::numeric)::int AS area
      FROM gis_buildings
      WHERE canonical_parcel_id IS NOT NULL
      GROUP BY canonical_parcel_id, year
    )
    SELECT p.canonical_parcel_id AS id,
           COALESCE(b24.cnt, 0)  AS c24, COALESCE(b24.area, 0) AS a24,
           COALESCE(b26.cnt, 0)  AS c26, COALESCE(b26.area, 0) AS a26,
           m.permit_state
    FROM parcels p
    LEFT JOIN b b24 ON b24.id = p.canonical_parcel_id AND b24.year = 2024
    LEFT JOIN b b26 ON b26.id = p.canonical_parcel_id AND b26.year = 2026
    LEFT JOIN src_municipal m ON m.canonical_parcel_id = p.canonical_parcel_id
    WHERE COALESCE(b24.cnt, 0) <> COALESCE(b26.cnt, 0)
       OR COALESCE(b26.area, 0) - COALESCE(b24.area, 0) > 15
    ORDER BY COALESCE(b26.area, 0) - COALESCE(b24.area, 0) DESC
  `);

  return rows.map((r) => {
    const permitStatus = PERMIT_MAP[r.permit_state ?? "NONE"] ?? "NOT_FOUND";
    const authorised = permitStatus === "APPROVED";
    const newCount = r.c26 - r.c24;
    return {
      parcelId: r.id,
      changeType: newCount > 0 ? "NEW_STRUCTURE" : "BUILT_UP_AREA_INCREASE",
      builtAreaBefore: r.a24,
      builtAreaAfter: r.a26,
      deltaArea: r.a26 - r.a24,
      permitStatus,
      finding: authorised
        ? "CONSISTENT_WITH_PERMIT"
        : permitStatus === "PENDING"
          ? "REVIEW"
          : "POTENTIAL_UNAUTHORISED_CONSTRUCTION",
      note: authorised
        ? "Detected construction matches an approved building permission."
        : `New construction detected with permit status "${permitStatus}". Requires field verification.`,
    };
  });
}
