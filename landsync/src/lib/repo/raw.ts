import { q } from "@/lib/db/pool";
import type {
  MunicipalSourceRecord,
  PlanningSourceRecord,
  RegistrationSourceRecord,
  RevenueSourceRecord,
} from "@/lib/data/source-schemas";

/**
 * The `raw` jsonb column on each src_* table is exactly the departmental record
 * shape the adapter expects — so ingestion round-trips losslessly.
 */
export interface RawRecords {
  revenue: RevenueSourceRecord | null;
  registration: RegistrationSourceRecord[];
  municipal: MunicipalSourceRecord | null;
  planning: PlanningSourceRecord | null;
}

export async function getRawRecords(id: string): Promise<RawRecords> {
  const [rev, reg, mun, pln] = await Promise.all([
    q<{ raw: RevenueSourceRecord }>(`SELECT raw FROM src_revenue WHERE canonical_parcel_id = $1`, [id]),
    q<{ raw: RegistrationSourceRecord }>(
      `SELECT raw FROM src_registration WHERE canonical_parcel_id = $1 ORDER BY transaction_date`,
      [id],
    ),
    q<{ raw: MunicipalSourceRecord }>(`SELECT raw FROM src_municipal WHERE canonical_parcel_id = $1`, [id]),
    q<{ raw: PlanningSourceRecord }>(`SELECT raw FROM src_planning WHERE canonical_parcel_id = $1`, [id]),
  ]);
  return {
    revenue: rev[0]?.raw ?? null,
    registration: reg.map((r) => r.raw),
    municipal: mun[0]?.raw ?? null,
    planning: pln[0]?.raw ?? null,
  };
}

export interface RawRecordsBundle {
  revenue: Map<string, RevenueSourceRecord>;
  registration: Map<string, RegistrationSourceRecord[]>;
  municipal: Map<string, MunicipalSourceRecord>;
  planning: Map<string, PlanningSourceRecord>;
}

/** All raw records in a handful of queries — for whole-dataset passes. */
export async function getAllRawRecords(): Promise<RawRecordsBundle> {
  const [rev, reg, mun, pln] = await Promise.all([
    q<{ id: string; raw: RevenueSourceRecord }>(
      `SELECT canonical_parcel_id AS id, raw FROM src_revenue`,
    ),
    q<{ id: string; raw: RegistrationSourceRecord }>(
      `SELECT canonical_parcel_id AS id, raw FROM src_registration ORDER BY canonical_parcel_id, transaction_date`,
    ),
    q<{ id: string; raw: MunicipalSourceRecord }>(
      `SELECT canonical_parcel_id AS id, raw FROM src_municipal`,
    ),
    q<{ id: string; raw: PlanningSourceRecord }>(
      `SELECT canonical_parcel_id AS id, raw FROM src_planning`,
    ),
  ]);

  const registration = new Map<string, RegistrationSourceRecord[]>();
  for (const r of reg) {
    (registration.get(r.id) ?? registration.set(r.id, []).get(r.id)!).push(r.raw);
  }
  return {
    revenue: new Map(rev.map((r) => [r.id, r.raw])),
    registration,
    municipal: new Map(mun.map((r) => [r.id, r.raw])),
    planning: new Map(pln.map((r) => [r.id, r.raw])),
  };
}

export interface BuildingAgg {
  count2024: number;
  count2026: number;
  all2026Permitted: boolean;
}

export async function getBuildingAggByParcel(): Promise<Map<string, BuildingAgg>> {
  const rows = await q<{ id: string; year: number; c: string; allp: boolean }>(
    `SELECT canonical_parcel_id AS id, year, count(*)::text AS c, bool_and(has_permit) AS allp
     FROM gis_buildings
     WHERE canonical_parcel_id IS NOT NULL
     GROUP BY canonical_parcel_id, year`,
  );
  const out = new Map<string, BuildingAgg>();
  for (const r of rows) {
    const agg = out.get(r.id) ?? { count2024: 0, count2026: 0, all2026Permitted: true };
    if (r.year === 2024) agg.count2024 = Number(r.c);
    if (r.year === 2026) {
      agg.count2026 = Number(r.c);
      agg.all2026Permitted = r.allp;
    }
    out.set(r.id, agg);
  }
  return out;
}

export async function getBuildingAgg(id: string): Promise<BuildingAgg> {
  const rows = await q<{ year: number; c: string; allp: boolean }>(
    `SELECT year, count(*)::text AS c, bool_and(has_permit) AS allp
     FROM gis_buildings WHERE canonical_parcel_id = $1 GROUP BY year`,
    [id],
  );
  const agg: BuildingAgg = { count2024: 0, count2026: 0, all2026Permitted: true };
  for (const r of rows) {
    if (r.year === 2024) agg.count2024 = Number(r.c);
    if (r.year === 2026) {
      agg.count2026 = Number(r.c);
      agg.all2026Permitted = r.allp;
    }
  }
  return agg;
}
