import type { DepartmentAdapter } from "@/lib/adapters/types";
import type {
  CanonicalParcel,
  RegistrationRecord,
} from "@/lib/canonical/types";
import type { RegistrationSourceRecord } from "@/lib/data/source-schemas";
import { registrationSourceSchema as schema } from "@/lib/data/source-zod";

const DEED_MAP: Record<
  RegistrationSourceRecord["deed_type"],
  RegistrationRecord["transactionType"]
> = {
  SALE: "SALE_DEED",
  GIFT: "GIFT_DEED",
  PARTITION: "PARTITION",
  MORTGAGE: "MORTGAGE",
  LEASE: "LEASE",
};
const STATUS_MAP: Record<
  RegistrationSourceRecord["reg_status"],
  RegistrationRecord["registrationStatus"]
> = {
  RD_COMPLETE: "REGISTERED",
  RD_PENDING: "PENDING",
  RD_DISPUTE: "DISPUTED",
};

export const registrationAdapter: DepartmentAdapter<RegistrationSourceRecord[]> = {
  meta: {
    id: "adapter.registration.igr.v1",
    sourceSystem: "REGISTRATION",
    displayName: "Registration & Stamps (IGR e-Registration)",
    owner: "Inspector General of Registration",
    version: "1.0.0",
    identifierType: "REGISTRATION_PROPERTY_ID",
    sampleSourceSchema: [
      "property_reference", "doc_no", "deed_type", "buyer_name", "seller_name",
      "transaction_date", "consideration_value", "reg_status",
    ],
    fieldMappings: [
      { sourceField: "property_reference", canonicalPath: "identifiers[]", transform: "→ ParcelIdentifier{REGISTRATION_PROPERTY_ID}" },
      { sourceField: "deed_type", canonicalPath: "registrationRecords[].transactionType", transform: "SALE→SALE_DEED, GIFT→GIFT_DEED, …" },
      { sourceField: "buyer_name / seller_name", canonicalPath: "registrationRecords[].buyer / .seller", transform: "passthrough" },
      { sourceField: "reg_status", canonicalPath: "registrationRecords[].registrationStatus", transform: "RD_COMPLETE→REGISTERED, RD_DISPUTE→DISPUTED" },
      { sourceField: "deed_type=MORTGAGE", canonicalPath: "encumbrances[]", transform: "derive Encumbrance{type:MORTGAGE,status:ACTIVE}" },
    ],
  },

  toCanonical(canonicalParcelId, rawInput) {
    const rows = schema.parse(rawInput);
    const sorted = [...rows].sort(
      (a, b) => a.transaction_date.localeCompare(b.transaction_date),
    );

    const registrationRecords: RegistrationRecord[] = sorted.map((r) => ({
      parcelId: canonicalParcelId,
      documentNumber: r.doc_no,
      transactionType: DEED_MAP[r.deed_type],
      transactionDate: r.transaction_date,
      seller: r.seller_name,
      buyer: r.buyer_name,
      registrationStatus: STATUS_MAP[r.reg_status],
    }));

    const encumbrances: CanonicalParcel["encumbrances"] = sorted
      .filter((r) => r.deed_type === "MORTGAGE")
      .map((r) => ({
        parcelId: canonicalParcelId,
        type: "MORTGAGE" as const,
        status: "ACTIVE" as const,
        sourceReference: r.doc_no,
        effectiveFrom: r.transaction_date,
        effectiveTo: null,
      }));

    const fragment: Partial<CanonicalParcel> = {
      registrationRecords,
      encumbrances,
      identifiers: [
        {
          sourceSystem: "REGISTRATION",
          identifierType: "REGISTRATION_PROPERTY_ID",
          identifierValue: rows[0]?.property_reference ?? "",
        },
      ],
    };
    return fragment;
  },
};
