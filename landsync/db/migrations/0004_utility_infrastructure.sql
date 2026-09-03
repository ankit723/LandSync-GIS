-- Utility infrastructure networks (PS 26014 names "utility infrastructure" as a
-- core land-related dataset). Lines follow the road network, as real mains do.
CREATE TABLE gis_utilities (
  id            bigserial PRIMARY KEY,
  utility_type  text NOT NULL,            -- WATER | POWER | SEWER | TELECOM | GAS
  operator      text,
  status        text NOT NULL DEFAULT 'IN_SERVICE',
  geom          geometry(LineString, 4326) NOT NULL
);
CREATE INDEX gis_utilities_gix  ON gis_utilities USING gist (geom);
CREATE INDEX gis_utilities_type_ix ON gis_utilities (utility_type);
