import type { DepartmentAdapter } from "@/lib/adapters/types";
import type {
  BuildingPermission,
  CanonicalParcel,
  TaxRecord,
} from "@/lib/canonical/types";
import type { MunicipalSourceRecord } from "@/lib/data/source-schemas";
import { municipalSourceSchema as schema } from "@/lib/data/source-zod";

const TAX_MAP: Record<MunicipalSourceRecord["tax_status"], TaxRecord["paymentStatus"]> = {
  CLEARED: "PAID",
  OUTSTANDING: "DUE",
  PART: "PARTIALLY_PAID",
  EXEMPTED: "EXEMPT",
};
const PERMIT_MAP: Record<
  MunicipalSourceRecord["permit_state"],
  BuildingPermission["status"]
> = {
  SANCTIONED: "APPROVED",
  APPLIED: "PENDING",
  REFUSED: "REJECTED",
  NONE: "NOT_FOUND",
};

/** Municipal fiscal-year string "2025-26" → assessment year 2025. */
function fyToYear(fy: string): number {
  return Number.parseInt(fy.slice(0, 4), 10) || new Date().getFullYear();
}

export const municipalAdapter: DepartmentAdapter<MunicipalSourceRecord> = {
  meta: {
    id: "adapter.municipal.bmc.v1",
    sourceSystem: "MUNICIPAL",
    displayName: "Municipal Property Tax (BMC Holding Tax)",
    owner: "Bhubaneswar Municipal Corporation",
    version: "1.0.0",
    identifierType: "MUNICIPAL_HOLDING_NUMBER",
    sampleSourceSchema: [
      "holding_id", "taxpayer", "ward_no", "plinth_area_sqft", "annual_tax",
      "tax_status", "assessment_fy", "building_permit_ref", "permit_state", "sanctioned_floors",
    ],
    fieldMappings: [
      { sourceField: "holding_id", canonicalPath: "identifiers[]", transform: "→ ParcelIdentifier{MUNICIPAL_HOLDING_NUMBER}" },
      { sourceField: "assessment_fy + annual_tax + tax_status", canonicalPath: "taxationRecords[]", transform: "fy '2025-26'→2025; CLEARED→PAID, OUTSTANDING→DUE" },
      { sourceField: "permit_state + building_permit_ref", canonicalPath: "buildingPermissions[]", transform: "SANCTIONED→APPROVED, NONE→NOT_FOUND" },
      { sourceField: "ward_no", canonicalPath: "administrativeLocation.ward", transform: "passthrough" },
      { sourceField: "plinth_area_sqft", canonicalPath: "metadata (used by risk engine)", transform: "sqft × 0.092903 → m² for area cross-check" },
    ],
  },

  toCanonical(canonicalParcelId, rawInput) {
    const raw = schema.parse(rawInput);

    const taxationRecords: TaxRecord[] = [
      {
        parcelId: canonicalParcelId,
        assessmentYear: fyToYear(raw.assessment_fy),
        amount: raw.annual_tax,
        paymentStatus: TAX_MAP[raw.tax_status],
        taxpayer: raw.taxpayer,
        sourceSystem: "MUNICIPAL",
      },
    ];

    const buildingPermissions: BuildingPermission[] = [
      {
        parcelId: canonicalParcelId,
        permitNumber: raw.building_permit_ref,
        status: PERMIT_MAP[raw.permit_state],
        sanctionedUse: "As per sanctioned plan",
        sanctionedFloors: raw.sanctioned_floors,
        issuedOn: null,
      },
    ];

    const fragment: Partial<CanonicalParcel> = {
      taxationRecords,
      buildingPermissions,
      identifiers: [
        {
          sourceSystem: "MUNICIPAL",
          identifierType: "MUNICIPAL_HOLDING_NUMBER",
          identifierValue: raw.holding_id,
        },
      ],
      administrativeLocation: {
        state: "Odisha",
        district: "Khordha",
        ulbOrBlock: "Bhubaneswar (M.Corp.)",
        village: "",
        ward: raw.ward_no,
      },
    };
    return fragment;
  },
};

/** Exposed for the record-consistency engine (area cross-check). */
export function municipalPlinthSqm(raw: MunicipalSourceRecord): number {
  return Math.round(raw.plinth_area_sqft * 0.092903);
}
