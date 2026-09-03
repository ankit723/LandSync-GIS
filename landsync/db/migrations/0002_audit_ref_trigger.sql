-- Auto-derive the human-readable audit reference from the row id.
ALTER TABLE audit_events ALTER COLUMN event_ref DROP NOT NULL;

CREATE OR REPLACE FUNCTION audit_events_set_ref() RETURNS trigger AS $$
BEGIN
  IF NEW.event_ref IS NULL THEN
    NEW.event_ref := 'AUD-' || lpad(NEW.id::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_ref_bi
  BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_set_ref();
