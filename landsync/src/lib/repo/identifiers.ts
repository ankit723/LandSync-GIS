import { q } from "@/lib/db/pool";

export interface ResolvedIdentifier {
  canonicalParcelId: string;
  matchedOn: string;
  matchedValue: string;
}

export interface IdentifierBundle {
  plot_no: string;
  survey_no: string;
  khata_no: string;
  holding_id: string;
  registration_property_id: string;
}

/** Resolve any departmental identifier / free text to canonical parcel id(s). */
export async function resolveIdentifiers(query: string): Promise<ResolvedIdentifier[]> {
  const term = query.trim();
  if (!term) return [];

  const exact = await q<{ id: string; matched_on: string; matched_value: string }>(
    `
    SELECT DISTINCT canonical_parcel_id AS id, identifier_type AS matched_on,
           identifier_value AS matched_value
    FROM parcel_identifiers
    WHERE lower(identifier_value) = lower($1)
    UNION
    SELECT canonical_parcel_id, 'CANONICAL_PARCEL_ID', canonical_parcel_id
    FROM parcels
    WHERE lower(canonical_parcel_id) = lower($1)
    `,
    [term],
  );

  const out: ResolvedIdentifier[] = exact.map((r) => ({
    canonicalParcelId: r.id,
    matchedOn: r.matched_on,
    matchedValue: r.matched_value,
  }));
  const seen = new Set(out.map((o) => o.canonicalParcelId));

  if (out.length < 25) {
    const fuzzy = await q<{ id: string; matched_value: string }>(
      `
      SELECT p.canonical_parcel_id AS id,
             COALESCE(r.recorded_holder, p.admin_village) AS matched_value
      FROM parcels p
      LEFT JOIN src_revenue r ON r.canonical_parcel_id = p.canonical_parcel_id
      WHERE r.recorded_holder ILIKE '%' || $1 || '%'
         OR p.admin_village   ILIKE '%' || $1 || '%'
         OR p.admin_ward      ILIKE '%' || $1 || '%'
      ORDER BY p.canonical_parcel_id
      LIMIT 25
      `,
      [term],
    );
    for (const r of fuzzy) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ canonicalParcelId: r.id, matchedOn: "TEXT", matchedValue: r.matched_value });
    }
  }

  return out.slice(0, 25);
}

export async function getIdentifierBundle(id: string): Promise<IdentifierBundle | null> {
  const rows = await q<{ identifier_type: string; identifier_value: string }>(
    `SELECT identifier_type, identifier_value FROM parcel_identifiers WHERE canonical_parcel_id = $1`,
    [id],
  );
  if (!rows.length) return null;
  const by = (t: string) => rows.find((r) => r.identifier_type === t)?.identifier_value ?? "";
  return {
    plot_no: by("PLOT_NUMBER"),
    survey_no: by("SURVEY_NUMBER"),
    khata_no: by("KHATA_NUMBER"),
    holding_id: by("MUNICIPAL_HOLDING_NUMBER"),
    registration_property_id: by("REGISTRATION_PROPERTY_ID"),
  };
}
