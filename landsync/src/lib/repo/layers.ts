import { q, q1 } from "@/lib/db/pool";
import type { FeatureCollection } from "@/lib/data/world";

export const LAYER_NAMES = [
  "parcels",
  "roads",
  "buildings2024",
  "buildings2026",
  "zoning",
  "poi",
  "restricted",
  "utilities",
] as const;
export type LayerName = (typeof LAYER_NAMES)[number];

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/** Build a GeoJSON FeatureCollection for a map layer directly in PostGIS. */
export async function getLayerFeatureCollection(name: LayerName): Promise<FeatureCollection> {
  let sql: string;
  switch (name) {
    case "parcels":
      sql = `
        SELECT json_build_object('type','FeatureCollection','features',
          COALESCE(json_agg(json_build_object(
            'type','Feature',
            'geometry', ST_AsGeoJSON(geom)::json,
            'properties', json_build_object(
              'id', canonical_parcel_id,
              'classification', land_classification,
              'area', round(calculated_area_m2)::int,
              'village', admin_village,
              'ward', admin_ward,
              'isGovernment', land_classification = 'GOVERNMENT'
            )
          )), '[]'::json)) AS fc
        FROM parcels`;
      break;
    case "roads":
      sql = `
        SELECT json_build_object('type','FeatureCollection','features',
          COALESCE(json_agg(json_build_object(
            'type','Feature','geometry', ST_AsGeoJSON(geom)::json,
            'properties', json_build_object('name',name,'ref',ref,'highway',highway,'class',road_class)
          )), '[]'::json)) AS fc
        FROM gis_roads`;
      break;
    case "buildings2024":
    case "buildings2026":
      sql = `
        SELECT json_build_object('type','FeatureCollection','features',
          COALESCE(json_agg(json_build_object(
            'type','Feature','geometry', ST_AsGeoJSON(geom)::json,
            'properties', json_build_object('parcelId',canonical_parcel_id,'year',year,'hasPermit',has_permit,'floors',floors)
          )), '[]'::json)) AS fc
        FROM gis_buildings WHERE year = ${name === "buildings2024" ? 2024 : 2026}`;
      break;
    case "zoning":
      sql = `
        SELECT json_build_object('type','FeatureCollection','features',
          COALESCE(json_agg(json_build_object(
            'type','Feature','geometry', ST_AsGeoJSON(geom)::json,
            'properties', json_build_object('zone_code',zone_code,'zone_label',zone_label,'permitted_use_codes',permitted_use_codes,'master_plan',master_plan)
          )), '[]'::json)) AS fc
        FROM gis_zoning`;
      break;
    case "poi":
      sql = `
        SELECT json_build_object('type','FeatureCollection','features',
          COALESCE(json_agg(json_build_object(
            'type','Feature','geometry', ST_AsGeoJSON(geom)::json,
            'properties', json_build_object('kind',kind,'name',name)
          )), '[]'::json)) AS fc
        FROM gis_poi`;
      break;
    case "restricted":
      sql = `
        SELECT json_build_object('type','FeatureCollection','features',
          COALESCE(json_agg(json_build_object(
            'type','Feature','geometry', ST_AsGeoJSON(geom)::json,
            'properties', json_build_object('type',restriction_type,'description',description,'authority',authority)
          )), '[]'::json)) AS fc
        FROM gis_restricted`;
      break;
    case "utilities":
      sql = `
        SELECT json_build_object('type','FeatureCollection','features',
          COALESCE(json_agg(json_build_object(
            'type','Feature','geometry', ST_AsGeoJSON(geom)::json,
            'properties', json_build_object('utility_type',utility_type,'operator',operator,'status',status)
          )), '[]'::json)) AS fc
        FROM gis_utilities`;
      break;
    default:
      return EMPTY;
  }
  const row = await q1<{ fc: FeatureCollection }>(sql);
  return row?.fc ?? EMPTY;
}

export async function layerFeatureCounts(): Promise<Record<string, number>> {
  const rows = await q<{ t: string; c: string }>(`
    SELECT 'parcels' t, count(*)::text c FROM parcels
    UNION ALL SELECT 'roads', count(*)::text FROM gis_roads
    UNION ALL SELECT 'buildings2024', count(*)::text FROM gis_buildings WHERE year = 2024
    UNION ALL SELECT 'buildings2026', count(*)::text FROM gis_buildings WHERE year = 2026
    UNION ALL SELECT 'zoning', count(*)::text FROM gis_zoning
    UNION ALL SELECT 'poi', count(*)::text FROM gis_poi
    UNION ALL SELECT 'restricted', count(*)::text FROM gis_restricted
    UNION ALL SELECT 'utilities', count(*)::text FROM gis_utilities
  `);
  return Object.fromEntries(rows.map((r) => [r.t, Number(r.c)]));
}
