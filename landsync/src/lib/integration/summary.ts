import { q1 } from "@/lib/db/pool";
import type { Role } from "@/lib/rbac/matrix";
import { sectionVisibility } from "@/lib/rbac/matrix";

export interface ParcelSummary {
  canonicalParcelId: string;
  plotNo: string;
  khataNo: string;
  holdingId: string;
  registrationId: string;
  classification: string;
  village: string;
  ward: string;
  centroid: [number, number];
  bbox: [number, number, number, number];
  calculatedArea: number;
  officialArea: number;
  recordedHolder: string;
  matchedOn?: string;
}

interface Row {
  id: string;
  classification: string;
  village: string;
  ward: string | null;
  calc_area: number;
  off_area: number;
  cx: number;
  cy: number;
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  plot_no: string | null;
  khata_no: string | null;
  holding_id: string | null;
  reg_id: string | null;
  recorded_holder: string | null;
}

export async function parcelSummary(
  canonicalParcelId: string,
  role: Role,
  matchedOn?: string,
): Promise<ParcelSummary | null> {
  const row = await q1<Row>(
    `
    SELECT p.canonical_parcel_id AS id,
           p.land_classification AS classification,
           p.admin_village AS village,
           p.admin_ward AS ward,
           p.calculated_area_m2::float8 AS calc_area,
           p.official_area_m2::float8 AS off_area,
           ST_X(p.geom_centroid) AS cx, ST_Y(p.geom_centroid) AS cy,
           ST_XMin(p.geom) AS xmin, ST_YMin(p.geom) AS ymin,
           ST_XMax(p.geom) AS xmax, ST_YMax(p.geom) AS ymax,
           max(pi.identifier_value) FILTER (WHERE pi.identifier_type = 'PLOT_NUMBER')               AS plot_no,
           max(pi.identifier_value) FILTER (WHERE pi.identifier_type = 'KHATA_NUMBER')              AS khata_no,
           max(pi.identifier_value) FILTER (WHERE pi.identifier_type = 'MUNICIPAL_HOLDING_NUMBER')  AS holding_id,
           max(pi.identifier_value) FILTER (WHERE pi.identifier_type = 'REGISTRATION_PROPERTY_ID')  AS reg_id,
           r.recorded_holder AS recorded_holder
    FROM parcels p
    LEFT JOIN parcel_identifiers pi ON pi.canonical_parcel_id = p.canonical_parcel_id
    LEFT JOIN src_revenue r ON r.canonical_parcel_id = p.canonical_parcel_id
    WHERE p.canonical_parcel_id = $1
    GROUP BY p.canonical_parcel_id, r.recorded_holder
    `,
    [canonicalParcelId],
  );
  if (!row) return null;

  const ownerVisible = sectionVisibility(role, "ownership") === "full";
  return {
    canonicalParcelId: row.id,
    plotNo: row.plot_no ?? "",
    khataNo: row.khata_no ?? "",
    holdingId: row.holding_id ?? "",
    registrationId: row.reg_id ?? "",
    classification: row.classification,
    village: row.village,
    ward: row.ward ?? "",
    centroid: [row.cx, row.cy],
    bbox: [row.xmin, row.ymin, row.xmax, row.ymax],
    calculatedArea: Math.round(row.calc_area),
    officialArea: Math.round(row.off_area),
    recordedHolder: ownerVisible ? (row.recorded_holder ?? "—") : "•••• restricted",
    matchedOn,
  };
}
