import "dotenv/config";
import { Pool } from "pg";
import { hash } from "@node-rs/argon2";
import { getWorld } from "../src/lib/data/world";
import { DEMO_USERS } from "../src/lib/auth/users";

const DEV_PASSWORD = process.env.SEED_PASSWORD ?? "landsync";

/**
 * Loads the deterministic synthetic world into PostGIS. This is the ONLY place
 * the generator is used now — at runtime the app reads from Postgres. Swapping
 * in real cadastral data = replacing this seed with real ingestion; the schema
 * and every query stay the same.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url });
  const w = getWorld();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      TRUNCATE parcel_identifiers, src_revenue, src_registration, src_municipal,
               src_planning, gis_roads, gis_buildings, gis_zoning, gis_poi,
               gis_restricted, gis_utilities, users, sync_runs, dead_letters RESTART IDENTITY CASCADE;
      TRUNCATE parcels CASCADE;
    `);

    // --- parcels -----------------------------------------------------------
    for (const p of w.parcels) {
      await client.query(
        `INSERT INTO parcels
           (canonical_parcel_id, geom, calculated_area_m2, official_area_m2,
            land_classification, admin_village, admin_ward)
         VALUES ($1, ST_SetSRID(ST_GeomFromGeoJSON($2),4326), $3, $4, $5, $6, $7)`,
        [
          p.canonicalParcelId,
          JSON.stringify(p.geometry),
          p.calculatedArea,
          p.officialArea,
          p.landClassification,
          p.village,
          p.ward,
        ],
      );
    }

    // --- identifiers -----------------------------------------------------
    for (const m of w.identifierMap) {
      const rows: [string, string, string][] = [
        ["REVENUE", "PLOT_NUMBER", m.plot_no],
        ["REVENUE", "SURVEY_NUMBER", m.survey_no],
        ["REVENUE", "KHATA_NUMBER", m.khata_no],
        ["MUNICIPAL", "MUNICIPAL_HOLDING_NUMBER", m.holding_id],
        ["REGISTRATION", "REGISTRATION_PROPERTY_ID", m.registration_property_id],
      ];
      for (const [sys, type, val] of rows) {
        await client.query(
          `INSERT INTO parcel_identifiers
             (canonical_parcel_id, source_system, identifier_type, identifier_value)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (source_system, identifier_type, identifier_value) DO NOTHING`,
          [m.canonicalParcelId, sys, type, val],
        );
      }
    }

    // --- raw revenue ---------------------------------------------------
    for (const [id, r] of Object.entries(w.revenue)) {
      await client.query(
        `INSERT INTO src_revenue
           (canonical_parcel_id, plot_no, survey_no, khata_no, recorded_holder,
            co_holders, tenancy, area_acres, land_kind, tehsil, village,
            mutation_date, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          id, r.plot_no, r.survey_no, r.khata_no, r.recorded_holder, r.co_holders,
          r.tenancy, r.area_acres, r.land_kind, r.tehsil, r.village,
          r.mutation_date, JSON.stringify(r),
        ],
      );
    }

    // --- raw registration -------------------------------------------
    for (const [id, list] of Object.entries(w.registration)) {
      for (const r of list) {
        await client.query(
          `INSERT INTO src_registration
             (canonical_parcel_id, property_reference, doc_no, deed_type, buyer_name,
              seller_name, transaction_date, consideration_value, reg_status, raw)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (doc_no) DO NOTHING`,
          [
            id, r.property_reference, r.doc_no, r.deed_type, r.buyer_name,
            r.seller_name, r.transaction_date, r.consideration_value, r.reg_status,
            JSON.stringify(r),
          ],
        );
      }
    }

    // --- raw municipal -------------------------------------------------
    for (const [id, r] of Object.entries(w.municipal)) {
      await client.query(
        `INSERT INTO src_municipal
           (canonical_parcel_id, holding_id, taxpayer, ward_no, plinth_area_sqft,
            annual_tax, tax_status, assessment_fy, building_permit_ref, permit_state,
            sanctioned_floors, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          id, r.holding_id, r.taxpayer, r.ward_no, r.plinth_area_sqft, r.annual_tax,
          r.tax_status, r.assessment_fy, r.building_permit_ref, r.permit_state,
          r.sanctioned_floors, JSON.stringify(r),
        ],
      );
    }

    // --- raw planning ----------------------------------------------
    for (const [id, r] of Object.entries(w.planning)) {
      await client.query(
        `INSERT INTO src_planning
           (canonical_parcel_id, zone_code, zone_label, permitted_use_codes,
            master_plan, overlay, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, r.zone_code, r.zone_label, r.permitted_use_codes, r.master_plan, r.overlay, JSON.stringify(r)],
      );
    }

    // --- GIS layers -----------------------------------------------
    for (const f of w.layers.roads.features) {
      const pr = f.properties as Record<string, unknown>;
      await client.query(
        `INSERT INTO gis_roads (name, ref, highway, road_class, geom)
         VALUES ($1,$2,$3,$4, ST_SetSRID(ST_GeomFromGeoJSON($5),4326))`,
        [pr.name ?? null, pr.ref ?? null, Boolean(pr.highway), pr.class ?? null, JSON.stringify(f.geometry)],
      );
    }
    for (const [fc, year] of [
      [w.layers.buildings2024, 2024],
      [w.layers.buildings2026, 2026],
    ] as const) {
      for (const f of fc.features) {
        const pr = f.properties as Record<string, unknown>;
        await client.query(
          `INSERT INTO gis_buildings (canonical_parcel_id, year, has_permit, floors, geom)
           VALUES ($1,$2,$3,$4, ST_SetSRID(ST_GeomFromGeoJSON($5),4326))`,
          [pr.parcelId ?? null, year, pr.hasPermit !== false, pr.floors ?? null, JSON.stringify(f.geometry)],
        );
      }
    }
    for (const f of w.layers.zoning.features) {
      const pr = f.properties as Record<string, unknown>;
      await client.query(
        `INSERT INTO gis_zoning (zone_code, zone_label, permitted_use_codes, master_plan, geom)
         VALUES ($1,$2,$3,$4, ST_SetSRID(ST_GeomFromGeoJSON($5),4326))`,
        [pr.zone_code, pr.zone_label, pr.permitted_use_codes, pr.master_plan ?? null, JSON.stringify(f.geometry)],
      );
    }
    for (const f of w.layers.poi.features) {
      const pr = f.properties as Record<string, unknown>;
      await client.query(
        `INSERT INTO gis_poi (kind, name, geom)
         VALUES ($1,$2, ST_SetSRID(ST_GeomFromGeoJSON($3),4326))`,
        [pr.kind, pr.name, JSON.stringify(f.geometry)],
      );
    }
    for (const f of w.layers.utilities.features) {
      const pr = f.properties as Record<string, unknown>;
      await client.query(
        `INSERT INTO gis_utilities (utility_type, operator, status, geom)
         VALUES ($1,$2,$3, ST_SetSRID(ST_GeomFromGeoJSON($4),4326))`,
        [pr.utility_type, pr.operator ?? null, pr.status ?? "IN_SERVICE", JSON.stringify(f.geometry)],
      );
    }
    for (const f of w.layers.restricted.features) {
      const pr = f.properties as Record<string, unknown>;
      await client.query(
        `INSERT INTO gis_restricted (restriction_type, description, authority, geom)
         VALUES ($1,$2,$3, ST_SetSRID(ST_GeomFromGeoJSON($4),4326))`,
        [pr.type, pr.description ?? null, pr.authority ?? null, JSON.stringify(f.geometry)],
      );
    }

    // --- departmental source systems (dept.*) — served by the mock APIs ----
    await client.query(
      `TRUNCATE dept.revenue, dept.registration, dept.municipal, dept.planning, sync_state`,
    );
    for (const [id, r] of Object.entries(w.revenue)) {
      await client.query(`INSERT INTO dept.revenue (parcel_key, record) VALUES ($1,$2)`, [
        id,
        JSON.stringify(r),
      ]);
    }
    for (const [id, list] of Object.entries(w.registration)) {
      await client.query(`INSERT INTO dept.registration (parcel_key, record) VALUES ($1,$2)`, [
        id,
        JSON.stringify(list),
      ]);
    }
    for (const [id, r] of Object.entries(w.municipal)) {
      await client.query(`INSERT INTO dept.municipal (parcel_key, record) VALUES ($1,$2)`, [
        id,
        JSON.stringify(r),
      ]);
    }
    for (const [id, r] of Object.entries(w.planning)) {
      await client.query(`INSERT INTO dept.planning (parcel_key, record) VALUES ($1,$2)`, [
        id,
        JSON.stringify(r),
      ]);
    }

    // --- users (argon2-hashed dev password) ---------------------------
    const pwHash = await hash(DEV_PASSWORD);
    for (const u of DEMO_USERS) {
      await client.query(
        `INSERT INTO users (id, name, role, department, designation, password_hash)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [u.id, u.name, u.role, u.department, u.designation, pwHash],
      );
    }

    // --- a couple of historic audit events so the trail is not empty ------
    await client.query(
      `INSERT INTO audit_events (actor_id, actor_role, action, resource_type, resource_id, previous_data, new_data, reason, outcome)
       VALUES
       ('USR-REG-1187','REGISTRATION','REGISTER_TRANSACTION','PARCEL','LS-OD-BBSR-000123',
        '{"owner":"Prev Holder"}','{"owner":"Ankit Kumar","deed":"SALE_DEED"}','Registered sale deed BBSR/2022/1123','SUCCESS'),
       ('USR-REV-2931','REVENUE','UPDATE_LAND_RECORD','PARCEL','LS-OD-BBSR-000045',
        '{"area_m2":500}','{"area_m2":512}','Survey correction after re-measurement','SUCCESS')`,
    );

    await client.query("COMMIT");

    const counts = await client.query<{ t: string; c: string }>(`
      SELECT 'parcels' t, count(*)::text c FROM parcels
      UNION ALL SELECT 'identifiers', count(*)::text FROM parcel_identifiers
      UNION ALL SELECT 'src_registration', count(*)::text FROM src_registration
      UNION ALL SELECT 'gis_buildings', count(*)::text FROM gis_buildings
      UNION ALL SELECT 'gis_roads', count(*)::text FROM gis_roads
      UNION ALL SELECT 'users', count(*)::text FROM users
    `);
    console.log("seeded:");
    for (const row of counts.rows) console.log(`  ${row.t.padEnd(18)} ${row.c}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
