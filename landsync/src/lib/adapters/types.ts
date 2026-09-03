import type { CanonicalParcel, SourceSystem } from "@/lib/canonical/types";

export interface FieldMapping {
  sourceField: string;
  canonicalPath: string;
  transform: string;
}

export interface AdapterMeta {
  id: string;
  sourceSystem: SourceSystem;
  displayName: string;
  owner: string;
  version: string;
  identifierType: string;
  sampleSourceSchema: string[];
  fieldMappings: FieldMapping[];
}

/** A departmental adapter turns ONE department's raw record(s) for a parcel
 *  into a fragment of the canonical model. */
export interface DepartmentAdapter<Raw = unknown> {
  meta: AdapterMeta;
  /** validate + transform. Throws on invalid input (caught by the pipeline). */
  toCanonical(canonicalParcelId: string, raw: Raw): Partial<CanonicalParcel>;
}
