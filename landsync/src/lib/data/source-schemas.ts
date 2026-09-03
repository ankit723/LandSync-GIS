/**
 * RAW departmental record shapes. Each department deliberately uses different
 * field names, identifiers, units and status vocabularies — this is the
 * heterogeneity the adapter layer exists to absorb. (PRD §7D)
 *
 * Nothing outside `lib/adapters/*` is allowed to read these types directly.
 */

/** Land Records / Revenue system. Areas in acres, names as free text. */
export interface RevenueSourceRecord {
  plot_no: string;
  survey_no: string;
  khata_no: string;
  recorded_holder: string;
  co_holders: string[];
  tenancy: "SELF" | "TENANT" | "GOVT";
  area_acres: number;
  land_kind: "ABADI" | "AGRICULTURE" | "GOVT" | "INDUSTRIAL" | "COMMERCIAL" | "VACANT";
  tehsil: string;
  village: string;
  mutation_date: string;
}

/** Property Registration system. Party names, ISO-ish dates, its own status set. */
export interface RegistrationSourceRecord {
  property_reference: string;
  doc_no: string;
  deed_type: "SALE" | "GIFT" | "PARTITION" | "MORTGAGE" | "LEASE";
  buyer_name: string;
  seller_name: string;
  transaction_date: string;
  consideration_value: number;
  reg_status: "RD_COMPLETE" | "RD_PENDING" | "RD_DISPUTE";
}

/** Municipal property-tax system. Holding ids, rupees, fiscal-year strings. */
export interface MunicipalSourceRecord {
  holding_id: string;
  taxpayer: string;
  ward_no: string;
  plinth_area_sqft: number;
  annual_tax: number;
  tax_status: "CLEARED" | "OUTSTANDING" | "PART" | "EXEMPTED";
  assessment_fy: string; // "2025-26"
  building_permit_ref: string | null;
  permit_state: "SANCTIONED" | "APPLIED" | "REFUSED" | "NONE";
  sanctioned_floors: number | null;
}

/** Planning & Zoning system. Zone codes + permitted-use codes. */
export interface PlanningSourceRecord {
  parcel_key: string; // uses canonical id here — planning dept onboarded later
  zone_code: string;
  zone_label: string;
  permitted_use_codes: string[]; // R, C, A, I, G, PSP
  master_plan: string;
  overlay: string | null; // "FLOOD", "CRZ", "HERITAGE", null
}

export interface IdentifierMapEntry {
  canonicalParcelId: string;
  plot_no: string;
  survey_no: string;
  khata_no: string;
  holding_id: string;
  registration_property_id: string;
}
