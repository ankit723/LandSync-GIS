import { q } from "@/lib/db/pool";
import { withCache } from "@/lib/db/cache";
import { buildAllCanonicalParcels } from "@/lib/integration/pipeline";
import { detectInconsistencies } from "@/lib/intelligence/inconsistency";

export interface AnomalyRow {
  parcelId: string;
  plotNo: string;
  village: string;
  riskLevel: string;
  confidence: number;
  topReason: string;
  reasonCodes: string[];
  requiresHumanVerification: boolean;
}

const ADVISORY_ONLY = new Set(["PROPERTY_TAX_DUE", "ACTIVE_ENCUMBRANCE"]);
const ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 } as const;

async function compute(): Promise<AnomalyRow[]> {
  const [assemblies, plots] = await Promise.all([
    buildAllCanonicalParcels(),
    q<{ id: string; plot: string }>(
      `SELECT canonical_parcel_id AS id, identifier_value AS plot
       FROM parcel_identifiers WHERE identifier_type = 'PLOT_NUMBER'`,
    ),
  ]);
  const plotById = new Map(plots.map((p) => [p.id, p.plot]));

  const rows: AnomalyRow[] = [];
  for (const a of assemblies) {
    const r = detectInconsistencies(a.parcel, a.aux);
    if (r.riskLevel === "NONE") continue;
    if (r.reasons.length > 0 && r.reasons.every((x) => ADVISORY_ONLY.has(x.code))) continue;
    rows.push({
      parcelId: a.parcel.canonicalParcelId,
      plotNo: plotById.get(a.parcel.canonicalParcelId) ?? "",
      village: a.parcel.administrativeLocation.village,
      riskLevel: r.riskLevel,
      confidence: r.confidence,
      topReason: r.reasons[0]?.detail ?? "",
      reasonCodes: r.reasons.map((x) => x.code),
      requiresHumanVerification: r.requiresHumanVerification,
    });
  }
  rows.sort(
    (a, b) =>
      ORDER[a.riskLevel as keyof typeof ORDER] - ORDER[b.riskLevel as keyof typeof ORDER] ||
      b.confidence - a.confidence,
  );
  return rows;
}

export function anomalyRegister(): Promise<AnomalyRow[]> {
  return withCache("intel:anomalies:v1", 30, compute);
}
