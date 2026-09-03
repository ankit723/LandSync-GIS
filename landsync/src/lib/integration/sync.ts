import { q, q1, tx } from "@/lib/db/pool";
import { cacheDel } from "@/lib/db/cache";
import { deptFetch, type SyncSource } from "@/lib/integration/clients";
export type { SyncSource } from "@/lib/integration/clients";
import {
  municipalSourceSchema,
  planningSourceSchema,
  registrationSourceSchema,
  revenueSourceSchema,
} from "@/lib/data/source-zod";
import type {
  MunicipalSourceRecord,
  PlanningSourceRecord,
  RegistrationSourceRecord,
  RevenueSourceRecord,
} from "@/lib/data/source-schemas";
import type { PoolClient } from "pg";

const ADAPTER_ID: Record<SyncSource, string> = {
  REVENUE: "adapter.revenue.odisha.v1",
  REGISTRATION: "adapter.registration.igr.v1",
  MUNICIPAL: "adapter.municipal.bmc.v1",
  PLANNING: "adapter.planning.bda.v1",
};

export interface SyncRunResult {
  runId: number;
  source: SyncSource;
  recordsIn: number;
  recordsOk: number;
  recordsFailed: number;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  error?: string;
  pages: number;
}

/* -------------------------------------------------------------------------- */
/* Per-source upsert into src_* (Land Stack's ingested copy)                     */
/* -------------------------------------------------------------------------- */

async function upsertRevenue(c: PoolClient, id: string, r: RevenueSourceRecord) {
  await c.query(
    `INSERT INTO src_revenue
       (canonical_parcel_id, plot_no, survey_no, khata_no, recorded_holder, co_holders,
        tenancy, area_acres, land_kind, tehsil, village, mutation_date, raw, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
     ON CONFLICT (canonical_parcel_id) DO UPDATE SET
       plot_no=EXCLUDED.plot_no, survey_no=EXCLUDED.survey_no, khata_no=EXCLUDED.khata_no,
       recorded_holder=EXCLUDED.recorded_holder, co_holders=EXCLUDED.co_holders,
       tenancy=EXCLUDED.tenancy, area_acres=EXCLUDED.area_acres, land_kind=EXCLUDED.land_kind,
       tehsil=EXCLUDED.tehsil, village=EXCLUDED.village, mutation_date=EXCLUDED.mutation_date,
       raw=EXCLUDED.raw, synced_at=now()`,
    [
      id, r.plot_no, r.survey_no, r.khata_no, r.recorded_holder, r.co_holders, r.tenancy,
      r.area_acres, r.land_kind, r.tehsil, r.village, r.mutation_date, JSON.stringify(r),
    ],
  );
  await upsertIdentifiers(c, id, [
    ["REVENUE", "PLOT_NUMBER", r.plot_no],
    ["REVENUE", "SURVEY_NUMBER", r.survey_no],
    ["REVENUE", "KHATA_NUMBER", r.khata_no],
  ]);
}

async function upsertMunicipal(c: PoolClient, id: string, r: MunicipalSourceRecord) {
  await c.query(
    `INSERT INTO src_municipal
       (canonical_parcel_id, holding_id, taxpayer, ward_no, plinth_area_sqft, annual_tax,
        tax_status, assessment_fy, building_permit_ref, permit_state, sanctioned_floors, raw, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
     ON CONFLICT (canonical_parcel_id) DO UPDATE SET
       holding_id=EXCLUDED.holding_id, taxpayer=EXCLUDED.taxpayer, ward_no=EXCLUDED.ward_no,
       plinth_area_sqft=EXCLUDED.plinth_area_sqft, annual_tax=EXCLUDED.annual_tax,
       tax_status=EXCLUDED.tax_status, assessment_fy=EXCLUDED.assessment_fy,
       building_permit_ref=EXCLUDED.building_permit_ref, permit_state=EXCLUDED.permit_state,
       sanctioned_floors=EXCLUDED.sanctioned_floors, raw=EXCLUDED.raw, synced_at=now()`,
    [
      id, r.holding_id, r.taxpayer, r.ward_no, r.plinth_area_sqft, r.annual_tax, r.tax_status,
      r.assessment_fy, r.building_permit_ref, r.permit_state, r.sanctioned_floors, JSON.stringify(r),
    ],
  );
  await upsertIdentifiers(c, id, [["MUNICIPAL", "MUNICIPAL_HOLDING_NUMBER", r.holding_id]]);
}

async function upsertPlanning(c: PoolClient, id: string, r: PlanningSourceRecord) {
  await c.query(
    `INSERT INTO src_planning
       (canonical_parcel_id, zone_code, zone_label, permitted_use_codes, master_plan, overlay, raw, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (canonical_parcel_id) DO UPDATE SET
       zone_code=EXCLUDED.zone_code, zone_label=EXCLUDED.zone_label,
       permitted_use_codes=EXCLUDED.permitted_use_codes, master_plan=EXCLUDED.master_plan,
       overlay=EXCLUDED.overlay, raw=EXCLUDED.raw, synced_at=now()`,
    [id, r.zone_code, r.zone_label, r.permitted_use_codes, r.master_plan, r.overlay, JSON.stringify(r)],
  );
}

async function upsertRegistration(c: PoolClient, id: string, list: RegistrationSourceRecord[]) {
  await c.query(`DELETE FROM src_registration WHERE canonical_parcel_id = $1`, [id]);
  for (const r of list) {
    await c.query(
      `INSERT INTO src_registration
         (canonical_parcel_id, property_reference, doc_no, deed_type, buyer_name, seller_name,
          transaction_date, consideration_value, reg_status, raw, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
       ON CONFLICT (doc_no) DO UPDATE SET
         canonical_parcel_id=EXCLUDED.canonical_parcel_id, buyer_name=EXCLUDED.buyer_name,
         seller_name=EXCLUDED.seller_name, reg_status=EXCLUDED.reg_status, raw=EXCLUDED.raw,
         synced_at=now()`,
      [
        id, r.property_reference, r.doc_no, r.deed_type, r.buyer_name, r.seller_name,
        r.transaction_date, r.consideration_value, r.reg_status, JSON.stringify(r),
      ],
    );
  }
  if (list[0]?.property_reference) {
    await upsertIdentifiers(c, id, [
      ["REGISTRATION", "REGISTRATION_PROPERTY_ID", list[0].property_reference],
    ]);
  }
}

async function upsertIdentifiers(
  c: PoolClient,
  id: string,
  rows: [string, string, string][],
) {
  for (const [sys, type, val] of rows) {
    if (!val) continue;
    await c.query(
      `INSERT INTO parcel_identifiers (canonical_parcel_id, source_system, identifier_type, identifier_value)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (source_system, identifier_type, identifier_value) DO NOTHING`,
      [id, sys, type, val],
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Orchestrator                                                                */
/* -------------------------------------------------------------------------- */

function validateRecord(source: SyncSource, record: unknown) {
  switch (source) {
    case "REVENUE":
      return revenueSourceSchema.safeParse(record);
    case "REGISTRATION":
      return registrationSourceSchema.safeParse(record);
    case "MUNICIPAL":
      return municipalSourceSchema.safeParse(record);
    case "PLANNING":
      return planningSourceSchema.safeParse(record);
  }
}

async function ingestItem(c: PoolClient, source: SyncSource, id: string, data: unknown) {
  switch (source) {
    case "REVENUE":
      return upsertRevenue(c, id, data as RevenueSourceRecord);
    case "REGISTRATION":
      return upsertRegistration(c, id, data as RegistrationSourceRecord[]);
    case "MUNICIPAL":
      return upsertMunicipal(c, id, data as MunicipalSourceRecord);
    case "PLANNING":
      return upsertPlanning(c, id, data as PlanningSourceRecord);
  }
}

/** Fetch → validate → transform-ready ingest for one departmental source. */
export async function runSync(
  source: SyncSource,
  opts: { full?: boolean; pageLimit?: number } = {},
): Promise<SyncRunResult> {
  const run = await q1<{ id: number }>(
    `INSERT INTO sync_runs (adapter_id, source_system, status) VALUES ($1,$2,'RUNNING') RETURNING id`,
    [ADAPTER_ID[source], source],
  );
  const runId = run!.id;

  let since = opts.full
    ? null
    : (
        await q1<{ last_since: string | null }>(
          `SELECT to_char(last_since AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS last_since
           FROM sync_state WHERE source_system = $1`,
          [source],
        )
      )?.last_since ?? null;

  let recordsIn = 0;
  let recordsOk = 0;
  let recordsFailed = 0;
  let pages = 0;
  const pageLimit = opts.pageLimit ?? 500;

  try {
    for (let guard = 0; guard < 50; guard++) {
      const page = await deptFetch(source, { since, limit: pageLimit });
      pages += 1;
      if (page.items.length === 0) break;

      await tx(async (c) => {
        for (const item of page.items) {
          recordsIn += 1;
          const parsed = validateRecord(source, item.record);
          if (!parsed || !parsed.success) {
            recordsFailed += 1;
            await c.query(
              `INSERT INTO dead_letters (adapter_id, source_system, payload, error)
               VALUES ($1,$2,$3,$4)`,
              [
                ADAPTER_ID[source],
                source,
                JSON.stringify(item.record ?? null),
                parsed && !parsed.success
                  ? JSON.stringify(parsed.error.issues.slice(0, 5))
                  : "validation error",
              ],
            );
            continue;
          }
          await ingestItem(c, source, item.canonical_parcel_id, parsed.data);
          recordsOk += 1;
        }
      });

      since = page.nextSince;
      if (page.items.length < pageLimit) break;
    }

    await q(
      `INSERT INTO sync_state (source_system, last_since, updated_at)
       VALUES ($1,$2, now())
       ON CONFLICT (source_system) DO UPDATE SET last_since = EXCLUDED.last_since, updated_at = now()`,
      [source, since],
    );

    const status: SyncRunResult["status"] = recordsFailed === 0 ? "SUCCESS" : "PARTIAL";
    await q(
      `UPDATE sync_runs SET finished_at = now(), records_in=$2, records_ok=$3, records_failed=$4, status=$5
       WHERE id = $1`,
      [runId, recordsIn, recordsOk, recordsFailed, status],
    );
    await cacheDel("intel:");

    return { runId, source, recordsIn, recordsOk, recordsFailed, status, pages };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await q(
      `UPDATE sync_runs SET finished_at = now(), records_in=$2, records_ok=$3, records_failed=$4,
         status='FAILED', error=$5 WHERE id = $1`,
      [runId, recordsIn, recordsOk, recordsFailed, message],
    );
    return {
      runId,
      source,
      recordsIn,
      recordsOk,
      recordsFailed,
      status: "FAILED",
      error: message,
      pages,
    };
  }
}

export async function runAllSyncs(opts: { full?: boolean } = {}): Promise<SyncRunResult[]> {
  const out: SyncRunResult[] = [];
  for (const s of ["REVENUE", "REGISTRATION", "MUNICIPAL", "PLANNING"] as SyncSource[]) {
    out.push(await runSync(s, opts));
  }
  return out;
}

export interface SyncRunRow {
  id: number;
  adapterId: string;
  sourceSystem: string;
  startedAt: string;
  finishedAt: string | null;
  recordsIn: number;
  recordsOk: number;
  recordsFailed: number;
  status: string;
  error: string | null;
}

export async function listSyncRuns(limit = 20): Promise<SyncRunRow[]> {
  const rows = await q<{
    id: number;
    adapter_id: string;
    source_system: string;
    started_at: string;
    finished_at: string | null;
    records_in: number;
    records_ok: number;
    records_failed: number;
    status: string;
    error: string | null;
  }>(
    `SELECT id, adapter_id, source_system, started_at::text, finished_at::text,
            records_in, records_ok, records_failed, status, error
     FROM sync_runs ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    adapterId: r.adapter_id,
    sourceSystem: r.source_system,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    recordsIn: r.records_in,
    recordsOk: r.records_ok,
    recordsFailed: r.records_failed,
    status: r.status,
    error: r.error,
  }));
}

export async function deadLetterCount(): Promise<number> {
  const r = await q1<{ c: string }>(`SELECT count(*)::text c FROM dead_letters WHERE resolved = false`);
  return Number(r?.c ?? 0);
}
