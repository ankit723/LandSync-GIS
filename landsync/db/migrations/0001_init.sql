-- LandSync core schema. PostGIS-backed, parcel-centric.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Canonical parcel + identifier resolution
-- ---------------------------------------------------------------------------
CREATE TABLE parcels (
  canonical_parcel_id  text PRIMARY KEY,
  geom                 geometry(Polygon, 4326) NOT NULL,
  geom_centroid        geometry(Point, 4326)
                         GENERATED ALWAYS AS (ST_Centroid(geom)) STORED,
  calculated_area_m2   numeric NOT NULL,
  official_area_m2     numeric NOT NULL,
  land_classification  text NOT NULL,
  admin_state          text NOT NULL DEFAULT 'Odisha',
  admin_district       text NOT NULL DEFAULT 'Khordha',
  admin_ulb_or_block   text NOT NULL DEFAULT 'Bhubaneswar',
  admin_village        text NOT NULL DEFAULT '',
  admin_ward           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX parcels_geom_gix       ON parcels USING gist (geom);
CREATE INDEX parcels_centroid_gix   ON parcels USING gist (geom_centroid);
CREATE INDEX parcels_class_ix       ON parcels (land_classification);
CREATE INDEX parcels_ward_ix        ON parcels (admin_ward);
CREATE INDEX parcels_village_trgm   ON parcels USING gin (admin_village gin_trgm_ops);

CREATE TABLE parcel_identifiers (
  id                   bigserial PRIMARY KEY,
  canonical_parcel_id  text NOT NULL REFERENCES parcels(canonical_parcel_id) ON DELETE CASCADE,
  source_system        text NOT NULL,
  identifier_type      text NOT NULL,
  identifier_value     text NOT NULL,
  UNIQUE (source_system, identifier_type, identifier_value)
);
CREATE INDEX parcel_identifiers_value_ix  ON parcel_identifiers (lower(identifier_value));
CREATE INDEX parcel_identifiers_parcel_ix ON parcel_identifiers (canonical_parcel_id);

-- ---------------------------------------------------------------------------
-- Raw departmental records (what adapters ingest — one table per source system)
-- ---------------------------------------------------------------------------
CREATE TABLE src_revenue (
  canonical_parcel_id  text PRIMARY KEY REFERENCES parcels(canonical_parcel_id) ON DELETE CASCADE,
  plot_no              text,
  survey_no            text,
  khata_no             text,
  recorded_holder      text NOT NULL,
  co_holders           text[] NOT NULL DEFAULT '{}',
  tenancy              text NOT NULL,
  area_acres           numeric NOT NULL,
  land_kind            text NOT NULL,
  tehsil               text,
  village              text,
  mutation_date        date,
  ingested_at          timestamptz NOT NULL DEFAULT now(),
  raw                  jsonb NOT NULL
);

CREATE TABLE src_registration (
  id                   bigserial PRIMARY KEY,
  canonical_parcel_id  text NOT NULL REFERENCES parcels(canonical_parcel_id) ON DELETE CASCADE,
  property_reference   text,
  doc_no               text NOT NULL,
  deed_type            text NOT NULL,
  buyer_name           text NOT NULL,
  seller_name          text NOT NULL,
  transaction_date     date NOT NULL,
  consideration_value  numeric NOT NULL DEFAULT 0,
  reg_status           text NOT NULL,
  ingested_at          timestamptz NOT NULL DEFAULT now(),
  raw                  jsonb NOT NULL,
  UNIQUE (doc_no)
);
CREATE INDEX src_registration_parcel_ix ON src_registration (canonical_parcel_id);

CREATE TABLE src_municipal (
  canonical_parcel_id  text PRIMARY KEY REFERENCES parcels(canonical_parcel_id) ON DELETE CASCADE,
  holding_id           text,
  taxpayer             text NOT NULL,
  ward_no              text,
  plinth_area_sqft     numeric NOT NULL,
  annual_tax           numeric NOT NULL,
  tax_status           text NOT NULL,
  assessment_fy        text NOT NULL,
  building_permit_ref  text,
  permit_state         text NOT NULL,
  sanctioned_floors    int,
  ingested_at          timestamptz NOT NULL DEFAULT now(),
  raw                  jsonb NOT NULL
);

CREATE TABLE src_planning (
  canonical_parcel_id  text PRIMARY KEY REFERENCES parcels(canonical_parcel_id) ON DELETE CASCADE,
  zone_code            text NOT NULL,
  zone_label           text NOT NULL,
  permitted_use_codes  text[] NOT NULL,
  master_plan          text NOT NULL,
  overlay              text,
  ingested_at          timestamptz NOT NULL DEFAULT now(),
  raw                  jsonb NOT NULL
);

-- ---------------------------------------------------------------------------
-- GIS layers
-- ---------------------------------------------------------------------------
CREATE TABLE gis_roads (
  id         bigserial PRIMARY KEY,
  name       text,
  ref        text,
  highway    boolean NOT NULL DEFAULT false,
  road_class text,
  geom       geometry(LineString, 4326) NOT NULL
);
CREATE INDEX gis_roads_gix ON gis_roads USING gist (geom);

CREATE TABLE gis_buildings (
  id                  bigserial PRIMARY KEY,
  canonical_parcel_id text REFERENCES parcels(canonical_parcel_id) ON DELETE SET NULL,
  year                int NOT NULL,
  has_permit          boolean NOT NULL DEFAULT true,
  floors              int,
  geom                geometry(Polygon, 4326) NOT NULL
);
CREATE INDEX gis_buildings_gix       ON gis_buildings USING gist (geom);
CREATE INDEX gis_buildings_year_ix   ON gis_buildings (year);
CREATE INDEX gis_buildings_parcel_ix ON gis_buildings (canonical_parcel_id);

CREATE TABLE gis_zoning (
  id                  bigserial PRIMARY KEY,
  zone_code           text NOT NULL,
  zone_label          text NOT NULL,
  permitted_use_codes text[] NOT NULL,
  master_plan         text,
  geom                geometry(Polygon, 4326) NOT NULL
);
CREATE INDEX gis_zoning_gix ON gis_zoning USING gist (geom);

CREATE TABLE gis_poi (
  id   bigserial PRIMARY KEY,
  kind text NOT NULL,
  name text NOT NULL,
  geom geometry(Geometry, 4326) NOT NULL
);
CREATE INDEX gis_poi_gix  ON gis_poi USING gist (geom);
CREATE INDEX gis_poi_kind_ix ON gis_poi (kind);

CREATE TABLE gis_restricted (
  id               bigserial PRIMARY KEY,
  restriction_type text NOT NULL,
  description      text,
  authority        text,
  geom             geometry(Polygon, 4326) NOT NULL
);
CREATE INDEX gis_restricted_gix ON gis_restricted USING gist (geom);

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  role          text NOT NULL,
  department    text NOT NULL,
  designation   text NOT NULL,
  password_hash text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Append-only audit trail (PRD §8 FR-12)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_events (
  id            bigserial PRIMARY KEY,
  event_ref     text NOT NULL,
  ts            timestamptz NOT NULL DEFAULT now(),
  actor_id      text NOT NULL,
  actor_role    text NOT NULL,
  action        text NOT NULL,
  resource_type text NOT NULL,
  resource_id   text NOT NULL,
  previous_data jsonb,
  new_data      jsonb,
  reason        text,
  outcome       text NOT NULL
);
CREATE INDEX audit_events_ts_ix ON audit_events (ts DESC);

CREATE OR REPLACE FUNCTION audit_events_no_mutate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_block_mutate
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_no_mutate();

-- ---------------------------------------------------------------------------
-- Integration / sync bookkeeping (Phase 2)
-- ---------------------------------------------------------------------------
CREATE TABLE sync_runs (
  id             bigserial PRIMARY KEY,
  adapter_id     text NOT NULL,
  source_system  text NOT NULL,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  records_in     int NOT NULL DEFAULT 0,
  records_ok     int NOT NULL DEFAULT 0,
  records_failed int NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'RUNNING',
  error          text
);
CREATE INDEX sync_runs_adapter_ix ON sync_runs (adapter_id, started_at DESC);

CREATE TABLE dead_letters (
  id            bigserial PRIMARY KEY,
  adapter_id    text NOT NULL,
  source_system text NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  payload       jsonb NOT NULL,
  error         text NOT NULL,
  resolved      boolean NOT NULL DEFAULT false
);
