import { adapters } from "@/lib/adapters/registry";
import type { AdapterMeta } from "@/lib/adapters/types";
import type { CanonicalParcel, ParcelIdentifier, SourceSystem } from "@/lib/canonical/types";
import { getParcelRow, listParcelRows, type ParcelRow } from "@/lib/repo/parcels";
import { getIdentifierBundle } from "@/lib/repo/identifiers";
import {
  getRawRecords,
  getAllRawRecords,
  getBuildingAgg,
  getBuildingAggByParcel,
  type RawRecords,
} from "@/lib/repo/raw";
import { getUtilityConnections, getUtilityConnectionsAll } from "@/lib/repo/utilities";

export { resolveIdentifiers } from "@/lib/repo/identifiers";
export type { ResolvedIdentifier } from "@/lib/repo/identifiers";

/* -------------------------------------------------------------------------- */
/* Trace + aux                                                                 */
/* -------------------------------------------------------------------------- */

export interface IntegrationStepTrace {
  sourceSystem: SourceSystem;
  adapterId: string;
  status: "OK" | "ERROR";
  error?: string;
  rawSample: Record<string, unknown>;
  canonicalFragmentKeys: string[];
  mappings: AdapterMeta["fieldMappings"];
}

/** Extra facts the record-consistency engine needs beyond the canonical parcel. */
export interface ParcelAux {
  municipalPlinthSqft: number | null;
  building2024Count: number;
  building2026Count: number;
  all2026Permitted: boolean;
}

export interface CanonicalAssembly {
  parcel: CanonicalParcel;
  trace: IntegrationStepTrace[];
  aux: ParcelAux;
}

/* -------------------------------------------------------------------------- */
/* Assembly (pure)                                                             */
/* -------------------------------------------------------------------------- */

function dedupeIdentifiers(ids: ParcelIdentifier[]): ParcelIdentifier[] {
  const seen = new Set<string>();
  return ids.filter((i) => {
    const k = `${i.sourceSystem}:${i.identifierType}:${i.identifierValue}`;
    if (seen.has(k) || !i.identifierValue) return false;
    seen.add(k);
    return true;
  });
}

function assemble(row: ParcelRow, raw: RawRecords): { parcel: CanonicalParcel; trace: IntegrationStepTrace[] } {
  const id = row.canonicalParcelId;
  const trace: IntegrationStepTrace[] = [];
  const integratedSources: SourceSystem[] = [];

  const parcel: CanonicalParcel = {
    canonicalParcelId: id,
    geometry: row.geometry,
    calculatedArea: row.calculatedArea,
    officialArea: row.officialArea,
    landClassification: row.landClassification,
    administrativeLocation: {
      state: "Odisha",
      district: "Khordha",
      ulbOrBlock: "Bhubaneswar",
      village: row.village,
      ward: row.ward,
    },
    identifiers: [
      { sourceSystem: "LANDSTACK", identifierType: "PLOT_NUMBER", identifierValue: id },
    ],
    ownershipRecords: [],
    registrationRecords: [],
    taxationRecords: [],
    zoningInformation: null,
    buildingPermissions: [],
    encumbrances: [],
    restrictions: [],
    utilityConnections: [],
    metadata: { integratedSources, lastIntegratedAt: new Date().toISOString() },
  };

  const inputs: Record<SourceSystem, unknown> = {
    REVENUE: raw.revenue,
    REGISTRATION: raw.registration,
    MUNICIPAL: raw.municipal,
    PLANNING: raw.planning,
    LANDSTACK: null,
  };

  for (const adapter of Object.values(adapters)) {
    const src = adapter.meta.sourceSystem;
    const input = inputs[src];
    try {
      if (input == null || (Array.isArray(input) && input.length === 0)) {
        throw new Error(`no ${src} record ingested for parcel`);
      }
      const fragment = adapter.toCanonical(id, input as never);
      const target = parcel as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(fragment)) {
        if (Array.isArray(v)) target[k] = [...((target[k] as unknown[]) ?? []), ...v];
        else if (v && typeof v === "object") target[k] = { ...((target[k] as object) ?? {}), ...v };
        else if (v !== undefined) target[k] = v;
      }
      integratedSources.push(src);
      trace.push({
        sourceSystem: src,
        adapterId: adapter.meta.id,
        status: "OK",
        rawSample: Array.isArray(input)
          ? ((input[0] ?? {}) as Record<string, unknown>)
          : ((input ?? {}) as Record<string, unknown>),
        canonicalFragmentKeys: Object.keys(fragment),
        mappings: adapter.meta.fieldMappings,
      });
    } catch (err) {
      trace.push({
        sourceSystem: src,
        adapterId: adapter.meta.id,
        status: "ERROR",
        error: err instanceof Error ? err.message : String(err),
        rawSample: {},
        canonicalFragmentKeys: [],
        mappings: adapter.meta.fieldMappings,
      });
    }
  }

  parcel.identifiers = dedupeIdentifiers(parcel.identifiers);
  parcel.metadata.integratedSources = integratedSources;
  return { parcel, trace };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

export async function buildCanonicalParcel(id: string): Promise<CanonicalAssembly | null> {
  const [row, raw, buildingAgg, utilities] = await Promise.all([
    getParcelRow(id),
    getRawRecords(id),
    getBuildingAgg(id),
    getUtilityConnections(id),
  ]);
  if (!row) return null;
  const { parcel, trace } = assemble(row, raw);
  parcel.utilityConnections = utilities;
  return {
    parcel,
    trace,
    aux: {
      municipalPlinthSqft: raw.municipal?.plinth_area_sqft ?? null,
      building2024Count: buildingAgg.count2024,
      building2026Count: buildingAgg.count2026,
      all2026Permitted: buildingAgg.all2026Permitted,
    },
  };
}

export async function buildAllCanonicalParcels(): Promise<CanonicalAssembly[]> {
  const [rows, bundle, buildingAgg, utilities] = await Promise.all([
    listParcelRows(),
    getAllRawRecords(),
    getBuildingAggByParcel(),
    getUtilityConnectionsAll(),
  ]);

  return rows.map((row) => {
    const id = row.canonicalParcelId;
    const raw: RawRecords = {
      revenue: bundle.revenue.get(id) ?? null,
      registration: bundle.registration.get(id) ?? [],
      municipal: bundle.municipal.get(id) ?? null,
      planning: bundle.planning.get(id) ?? null,
    };
    const { parcel, trace } = assemble(row, raw);
    parcel.utilityConnections = utilities.get(id) ?? [];
    const agg = buildingAgg.get(id) ?? { count2024: 0, count2026: 0, all2026Permitted: true };
    return {
      parcel,
      trace,
      aux: {
        municipalPlinthSqft: raw.municipal?.plinth_area_sqft ?? null,
        building2024Count: agg.count2024,
        building2026Count: agg.count2026,
        all2026Permitted: agg.all2026Permitted,
      },
    };
  });
}

/** Identifier bundle (plot/khata/holding/registration ids) for a parcel. */
export { getIdentifierBundle };
