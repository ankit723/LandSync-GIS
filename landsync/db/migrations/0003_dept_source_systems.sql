-- Simulated departmental systems: their OWN databases, which the mock department
-- APIs serve over HTTP. LandSync's adapters ingest FROM here INTO the src_* tables.
CREATE SCHEMA IF NOT EXISTS dept;

CREATE TABLE dept.revenue (
  parcel_key   text PRIMARY KEY,          -- the department's link to a LandSync parcel
  record       jsonb NOT NULL,            -- the raw departmental record (their schema)
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dept_revenue_updated_ix ON dept.revenue (updated_at);

CREATE TABLE dept.registration (
  parcel_key   text PRIMARY KEY,
  record       jsonb NOT NULL,            -- array of deed records
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dept_registration_updated_ix ON dept.registration (updated_at);

CREATE TABLE dept.municipal (
  parcel_key   text PRIMARY KEY,
  record       jsonb NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dept_municipal_updated_ix ON dept.municipal (updated_at);

CREATE TABLE dept.planning (
  parcel_key   text PRIMARY KEY,
  record       jsonb NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dept_planning_updated_ix ON dept.planning (updated_at);

-- keep updated_at fresh on any change (so incremental sync sees it)
CREATE OR REPLACE FUNCTION dept.touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dept_revenue_touch      BEFORE UPDATE ON dept.revenue      FOR EACH ROW EXECUTE FUNCTION dept.touch_updated_at();
CREATE TRIGGER dept_registration_touch BEFORE UPDATE ON dept.registration FOR EACH ROW EXECUTE FUNCTION dept.touch_updated_at();
CREATE TRIGGER dept_municipal_touch    BEFORE UPDATE ON dept.municipal    FOR EACH ROW EXECUTE FUNCTION dept.touch_updated_at();
CREATE TRIGGER dept_planning_touch     BEFORE UPDATE ON dept.planning     FOR EACH ROW EXECUTE FUNCTION dept.touch_updated_at();

-- LandSync's per-source ingest watermark
CREATE TABLE sync_state (
  source_system text PRIMARY KEY,
  last_since     timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- add an ingest timestamp to src_* so we can show "last updated by sync"
ALTER TABLE src_revenue      ADD COLUMN IF NOT EXISTS synced_at timestamptz;
ALTER TABLE src_municipal    ADD COLUMN IF NOT EXISTS synced_at timestamptz;
ALTER TABLE src_planning     ADD COLUMN IF NOT EXISTS synced_at timestamptz;
ALTER TABLE src_registration ADD COLUMN IF NOT EXISTS synced_at timestamptz;
