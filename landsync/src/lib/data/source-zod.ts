import { z } from "zod";

/**
 * Zod schemas for the RAW departmental record shapes. Shared by the adapters
 * (transform-time validation) and the sync layer (ingest-time validation, with
 * failures routed to dead_letters).
 */

export const revenueSourceSchema = z.object({
  plot_no: z.string(),
  survey_no: z.string(),
  khata_no: z.string(),
  recorded_holder: z.string().min(1),
  co_holders: z.array(z.string()),
  tenancy: z.enum(["SELF", "TENANT", "GOVT"]),
  area_acres: z.number().positive(),
  land_kind: z.enum(["ABADI", "AGRICULTURE", "GOVT", "INDUSTRIAL", "COMMERCIAL", "VACANT"]),
  tehsil: z.string(),
  village: z.string(),
  mutation_date: z.string(),
});

export const registrationSourceRecordSchema = z.object({
  property_reference: z.string(),
  doc_no: z.string(),
  deed_type: z.enum(["SALE", "GIFT", "PARTITION", "MORTGAGE", "LEASE"]),
  buyer_name: z.string().min(1),
  seller_name: z.string().min(1),
  transaction_date: z.string(),
  consideration_value: z.number().nonnegative(),
  reg_status: z.enum(["RD_COMPLETE", "RD_PENDING", "RD_DISPUTE"]),
});
export const registrationSourceSchema = z.array(registrationSourceRecordSchema);

export const municipalSourceSchema = z.object({
  holding_id: z.string(),
  taxpayer: z.string().min(1),
  ward_no: z.string(),
  plinth_area_sqft: z.number().nonnegative(),
  annual_tax: z.number().nonnegative(),
  tax_status: z.enum(["CLEARED", "OUTSTANDING", "PART", "EXEMPTED"]),
  assessment_fy: z.string(),
  building_permit_ref: z.string().nullable(),
  permit_state: z.enum(["SANCTIONED", "APPLIED", "REFUSED", "NONE"]),
  sanctioned_floors: z.number().nullable(),
});

export const planningSourceSchema = z.object({
  parcel_key: z.string(),
  zone_code: z.string(),
  zone_label: z.string(),
  permitted_use_codes: z.array(z.string()),
  master_plan: z.string(),
  overlay: z.string().nullable(),
});

/** One ingest envelope item: a departmental record plus its parcel key. */
export const ingestItemSchema = z.object({
  canonical_parcel_id: z.string(),
  updated_at: z.string().optional(),
  record: z.unknown(),
});
export const ingestEnvelopeSchema = z.object({
  source: z.enum(["REVENUE", "REGISTRATION", "MUNICIPAL", "PLANNING"]),
  count: z.number(),
  next_since: z.string().nullable(),
  items: z.array(ingestItemSchema),
});
export type IngestEnvelope = z.infer<typeof ingestEnvelopeSchema>;
