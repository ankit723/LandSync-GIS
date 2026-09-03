import type { DepartmentAdapter } from "@/lib/adapters/types";
import type {
  CanonicalParcel,
  LandClassification,
  RightsRecord,
} from "@/lib/canonical/types";
import type { RevenueSourceRecord } from "@/lib/data/source-schemas";
import { revenueSourceSchema as schema } from "@/lib/data/source-zod";

const KIND_TO_CLASS: Record<RevenueSourceRecord["land_kind"], LandClassification> = {
  ABADI: "RESIDENTIAL",
  AGRICULTURE: "AGRICULTURAL",
  GOVT: "GOVERNMENT",
  INDUSTRIAL: "INDUSTRIAL",
  COMMERCIAL: "COMMERCIAL",
  VACANT: "VACANT",
};

export const revenueAdapter: DepartmentAdapter<RevenueSourceRecord> = {
  meta: {
    id: "adapter.revenue.odisha.v1",
    sourceSystem: "REVENUE",
    displayName: "Odisha Land Records (Bhulekh-style)",
    owner: "Revenue & Disaster Management Dept.",
    version: "1.0.0",
    identifierType: "PLOT_NUMBER / KHATA_NUMBER",
    sampleSourceSchema: [
      "plot_no", "survey_no", "khata_no", "recorded_holder", "co_holders",
      "tenancy", "area_acres", "land_kind", "tehsil", "village", "mutation_date",
    ],
    fieldMappings: [
      { sourceField: "recorded_holder + co_holders", canonicalPath: "ownershipRecords[]", transform: "split parties → RightsRecord{rightsType:OWNER}" },
      { sourceField: "area_acres", canonicalPath: "officialArea", transform: "acres × 4046.86 → m² (rounded)" },
      { sourceField: "land_kind", canonicalPath: "landClassification", transform: "code map ABADI→RESIDENTIAL, AGRICULTURE→AGRICULTURAL, …" },
      { sourceField: "plot_no / khata_no / survey_no", canonicalPath: "identifiers[]", transform: "→ ParcelIdentifier{sourceSystem:REVENUE}" },
      { sourceField: "mutation_date", canonicalPath: "ownershipRecords[].validFrom", transform: "passthrough ISO date" },
    ],
  },

  toCanonical(canonicalParcelId, rawInput) {
    const raw = schema.parse(rawInput);
    const holders = [raw.recorded_holder, ...raw.co_holders];
    const share = holders.length > 1 ? `1/${holders.length}` : "1/1";
    const ownershipRecords: RightsRecord[] = holders.map((name) => ({
      parcelId: canonicalParcelId,
      personReference: name,
      rightsType: raw.tenancy === "GOVT" ? "GOVERNMENT" : "OWNER",
      ownershipShare: share,
      sourceSystem: "REVENUE",
      validFrom: raw.mutation_date,
      validTo: null,
    }));

    const fragment: Partial<CanonicalParcel> = {
      officialArea: Math.round(raw.area_acres * 4046.86),
      landClassification: KIND_TO_CLASS[raw.land_kind],
      ownershipRecords,
      identifiers: [
        { sourceSystem: "REVENUE", identifierType: "PLOT_NUMBER", identifierValue: raw.plot_no },
        { sourceSystem: "REVENUE", identifierType: "SURVEY_NUMBER", identifierValue: raw.survey_no },
        { sourceSystem: "REVENUE", identifierType: "KHATA_NUMBER", identifierValue: raw.khata_no },
      ],
      administrativeLocation: {
        state: "Odisha",
        district: "Khordha",
        ulbOrBlock: raw.tehsil,
        village: raw.village,
      },
    };
    return fragment;
  },
};
