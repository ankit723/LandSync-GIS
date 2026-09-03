import type { DepartmentAdapter } from "@/lib/adapters/types";
import type {
  CanonicalParcel,
  LandClassification,
  Restriction,
  ZoningInformation,
} from "@/lib/canonical/types";
import type { PlanningSourceRecord } from "@/lib/data/source-schemas";
import { planningSourceSchema as schema } from "@/lib/data/source-zod";

const USE_CODE_MAP: Record<string, LandClassification> = {
  R: "RESIDENTIAL",
  C: "COMMERCIAL",
  A: "AGRICULTURAL",
  I: "INDUSTRIAL",
  G: "GOVERNMENT",
  PSP: "GOVERNMENT", // public / semi-public
};

const OVERLAY_MAP: Record<string, Restriction> = {
  FLOOD: {
    type: "FLOOD_RISK_ZONE",
    description: "Within notified flood-risk overlay — construction restricted",
    authority: "Bhubaneswar Development Authority",
  },
  CRZ: {
    type: "COASTAL_REGULATION",
    description: "Coastal Regulation Zone overlay",
    authority: "Odisha Coastal Zone Management Authority",
  },
  HERITAGE: {
    type: "HERITAGE_BUFFER",
    description: "Heritage precinct buffer — height & use controls apply",
    authority: "Dept. of Culture, Odisha",
  },
};

export const planningAdapter: DepartmentAdapter<PlanningSourceRecord> = {
  meta: {
    id: "adapter.planning.bda.v1",
    sourceSystem: "PLANNING",
    displayName: "Planning & Zoning (BDA Master Plan GIS)",
    owner: "Bhubaneswar Development Authority",
    version: "1.0.0",
    identifierType: "CANONICAL_PARCEL_ID (onboarded post-canonicalisation)",
    sampleSourceSchema: [
      "parcel_key", "zone_code", "zone_label", "permitted_use_codes", "master_plan", "overlay",
    ],
    fieldMappings: [
      { sourceField: "zone_code + zone_label + master_plan", canonicalPath: "zoningInformation", transform: "→ ZoningInformation" },
      { sourceField: "permitted_use_codes[]", canonicalPath: "zoningInformation.permittedLandUse[]", transform: "code map R→RESIDENTIAL, C→COMMERCIAL, A→AGRICULTURAL, PSP→GOVERNMENT" },
      { sourceField: "overlay", canonicalPath: "restrictions[]", transform: "FLOOD→FLOOD_RISK_ZONE, CRZ→COASTAL_REGULATION, HERITAGE→HERITAGE_BUFFER" },
    ],
  },

  toCanonical(_canonicalParcelId, rawInput) {
    const raw = schema.parse(rawInput);

    const permittedLandUse = Array.from(
      new Set(
        raw.permitted_use_codes
          .map((c) => USE_CODE_MAP[c])
          .filter((v): v is LandClassification => Boolean(v)),
      ),
    );

    const zoningInformation: ZoningInformation = {
      zoneName: raw.zone_label,
      zoneCode: raw.zone_code,
      permittedLandUse,
      masterPlanReference: raw.master_plan,
    };

    const restrictions: Restriction[] = raw.overlay && OVERLAY_MAP[raw.overlay]
      ? [OVERLAY_MAP[raw.overlay]]
      : [];

    const fragment: Partial<CanonicalParcel> = { zoningInformation, restrictions };
    return fragment;
  },
};
