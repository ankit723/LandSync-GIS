import { q } from "@/lib/db/pool";
import type { Feature } from "@/lib/data/world";
import type { SpatialFilter } from "@/lib/intelligence/nl-query";

export interface SpatialResult {
  count: number;
  parcelIds: string[];
  features: Feature[];
  appliedFilters: SpatialFilter;
  sql: string;
  timingMs: number;
}

/**
 * Execute a structured spatial filter as one PostGIS query against GIST-indexed
 * geometry. Distances use geography casts so `withinMeters` is true metres.
 * (PRD FR-07 — "queries must use actual geographic geometry".)
 */
export async function runSpatialQuery(filters: SpatialFilter): Promise<SpatialResult> {
  const where: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  if (filters.landUse?.length) where.push(`p.land_classification = ANY(${p(filters.landUse)})`);
  if (filters.ownership === "GOVERNMENT") where.push(`p.land_classification = 'GOVERNMENT'`);
  if (filters.ownership === "PRIVATE") where.push(`p.land_classification <> 'GOVERNMENT'`);
  if (filters.minArea != null) where.push(`p.calculated_area_m2 >= ${p(filters.minArea)}`);
  if (filters.maxArea != null) where.push(`p.calculated_area_m2 <= ${p(filters.maxArea)}`);
  if (filters.withinWard) where.push(`p.admin_ward = ${p(filters.withinWard)}`);

  if (filters.nearRoadRef) {
    where.push(`EXISTS (
      SELECT 1 FROM gis_roads r
      WHERE r.ref = ${p(filters.nearRoadRef.ref)}
        AND ST_DWithin(p.geom_centroid::geography, r.geom::geography, ${p(filters.nearRoadRef.withinMeters)})
    )`);
  }
  if (filters.nearPoi) {
    where.push(`EXISTS (
      SELECT 1 FROM gis_poi poi
      WHERE poi.kind = ${p(filters.nearPoi.kind)}
        AND ST_DWithin(p.geom_centroid::geography, poi.geom::geography, ${p(filters.nearPoi.withinMeters)})
    )`);
  }
  if (filters.nearUtility) {
    where.push(`EXISTS (
      SELECT 1 FROM gis_utilities u
      WHERE u.utility_type = ${p(filters.nearUtility.type)}
        AND ST_DWithin(p.geom::geography, u.geom::geography, ${p(filters.nearUtility.withinMeters)})
    )`);
  }
  if (filters.nearPoint) {
    where.push(
      `ST_DWithin(p.geom_centroid::geography, ST_SetSRID(ST_MakePoint(${p(
        filters.nearPoint.lon,
      )}, ${p(filters.nearPoint.lat)}), 4326)::geography, ${p(filters.nearPoint.withinMeters)})`,
    );
  }
  if (filters.intersects === "FLOOD_RISK_ZONE") {
    where.push(`EXISTS (
      SELECT 1 FROM gis_restricted gr
      WHERE gr.restriction_type = 'FLOOD_RISK_ZONE' AND ST_Intersects(p.geom, gr.geom)
    )`);
  }

  const sql = `
    SELECT p.canonical_parcel_id AS id,
           ST_AsGeoJSON(p.geom)::json AS geometry,
           p.land_classification AS classification,
           round(p.calculated_area_m2)::int AS area,
           p.admin_ward AS ward
    FROM parcels p
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY p.canonical_parcel_id`;

  const started = performance.now();
  const rows = await q<{
    id: string;
    geometry: Feature["geometry"];
    classification: string;
    area: number;
    ward: string | null;
  }>(sql, params);
  const timingMs = Number((performance.now() - started).toFixed(1));

  return {
    count: rows.length,
    parcelIds: rows.map((r) => r.id),
    features: rows.map((r) => ({
      type: "Feature",
      geometry: r.geometry,
      properties: { id: r.id, classification: r.classification, area: r.area, ward: r.ward },
    })),
    appliedFilters: filters,
    sql: sql.trim().replace(/\s+/g, " "),
    timingMs,
  };
}
