import { q } from "@/lib/db/pool";
import type { UtilityConnection } from "@/lib/canonical/types";

const WITHIN_M = 60; // a parcel is "served" by a main running within this distance

interface Row {
  id: string;
  utility_type: UtilityConnection["utilityType"];
  operator: string | null;
  status: string;
  dist: number;
}

function toConn(r: Row): UtilityConnection {
  return {
    utilityType: r.utility_type,
    operator: r.operator,
    status: r.status,
    distanceM: Math.round(r.dist),
  };
}

/** Utility mains passing within {WITHIN_M} of a single parcel. */
export async function getUtilityConnections(parcelId: string): Promise<UtilityConnection[]> {
  const rows = await q<Row>(
    `SELECT $1::text AS id, u.utility_type, u.operator, u.status,
            ST_Distance(p.geom::geography, u.geom::geography) AS dist
     FROM parcels p
     JOIN gis_utilities u
       ON ST_DWithin(p.geom::geography, u.geom::geography, $2)
     WHERE p.canonical_parcel_id = $1
     ORDER BY dist`,
    [parcelId, WITHIN_M],
  );
  return rows.map(toConn);
}

/** All parcel↔utility proximity links, for whole-dataset passes. */
export async function getUtilityConnectionsAll(): Promise<Map<string, UtilityConnection[]>> {
  const rows = await q<Row>(
    `SELECT p.canonical_parcel_id AS id, u.utility_type, u.operator, u.status,
            ST_Distance(p.geom::geography, u.geom::geography) AS dist
     FROM parcels p
     JOIN gis_utilities u
       ON ST_DWithin(p.geom::geography, u.geom::geography, $1)
     ORDER BY p.canonical_parcel_id, dist`,
    [WITHIN_M],
  );
  const out = new Map<string, UtilityConnection[]>();
  for (const r of rows) {
    (out.get(r.id) ?? out.set(r.id, []).get(r.id)!).push(toConn(r));
  }
  return out;
}
