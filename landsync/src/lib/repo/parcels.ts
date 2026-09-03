import { q, q1 } from "@/lib/db/pool";
import type { LandClassification, PolygonGeometry } from "@/lib/canonical/types";

export interface ParcelRow {
  canonicalParcelId: string;
  geometry: PolygonGeometry;
  centroid: [number, number];
  bbox: [number, number, number, number];
  calculatedArea: number;
  officialArea: number;
  landClassification: LandClassification;
  village: string;
  ward: string;
}

const SELECT = `
  SELECT canonical_parcel_id                         AS id,
         ST_AsGeoJSON(geom)::json                    AS geometry,
         calculated_area_m2::float8                  AS calc_area,
         official_area_m2::float8                    AS off_area,
         land_classification                         AS classification,
         admin_village                               AS village,
         COALESCE(admin_ward, '')                    AS ward,
         ST_X(geom_centroid)                         AS cx,
         ST_Y(geom_centroid)                         AS cy,
         ST_XMin(geom) AS xmin, ST_YMin(geom) AS ymin,
         ST_XMax(geom) AS xmax, ST_YMax(geom) AS ymax
  FROM parcels`;

interface Raw {
  id: string;
  geometry: PolygonGeometry;
  calc_area: number;
  off_area: number;
  classification: LandClassification;
  village: string;
  ward: string;
  cx: number;
  cy: number;
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

function toRow(r: Raw): ParcelRow {
  return {
    canonicalParcelId: r.id,
    geometry: r.geometry,
    centroid: [r.cx, r.cy],
    bbox: [r.xmin, r.ymin, r.xmax, r.ymax],
    calculatedArea: Math.round(r.calc_area),
    officialArea: Math.round(r.off_area),
    landClassification: r.classification,
    village: r.village,
    ward: r.ward,
  };
}

export async function getParcelRow(id: string): Promise<ParcelRow | null> {
  const r = await q1<Raw>(`${SELECT} WHERE canonical_parcel_id = $1`, [id]);
  return r ? toRow(r) : null;
}

export async function listParcelRows(): Promise<ParcelRow[]> {
  const rows = await q<Raw>(`${SELECT} ORDER BY canonical_parcel_id`);
  return rows.map(toRow);
}

export async function parcelClassCounts(): Promise<Record<string, number>> {
  const rows = await q<{ land_classification: string; c: string }>(
    `SELECT land_classification, count(*)::text AS c FROM parcels GROUP BY 1`,
  );
  return Object.fromEntries(rows.map((r) => [r.land_classification, Number(r.c)]));
}

export async function tableCounts(): Promise<Record<string, number>> {
  const rows = await q<{ t: string; c: string }>(`
    SELECT 'parcels' t, count(*)::text c FROM parcels
    UNION ALL SELECT 'parcel_identifiers', count(*)::text FROM parcel_identifiers
    UNION ALL SELECT 'gis_roads', count(*)::text FROM gis_roads
    UNION ALL SELECT 'gis_buildings_2024', count(*)::text FROM gis_buildings WHERE year = 2024
    UNION ALL SELECT 'gis_buildings_2026', count(*)::text FROM gis_buildings WHERE year = 2026
    UNION ALL SELECT 'gis_zoning', count(*)::text FROM gis_zoning
    UNION ALL SELECT 'gis_poi', count(*)::text FROM gis_poi
    UNION ALL SELECT 'gis_restricted', count(*)::text FROM gis_restricted
  `);
  return Object.fromEntries(rows.map((r) => [r.t, Number(r.c)]));
}
