-- Up Migration

-- De checklist reisdocumenten overlapte met de documentenlijst (die dezelfde
-- dingen al bijhoudt, inclusief bestand en geldigheidsdatum) — weg ermee.
DROP TRIGGER IF EXISTS requirement_set_updated_at ON requirement;
DROP TABLE IF EXISTS requirement;

-- Down Migration

CREATE TABLE requirement (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid NOT NULL REFERENCES trip (id) ON DELETE CASCADE,
  label       text NOT NULL,
  afgevinkt   boolean NOT NULL DEFAULT false,
  volgorde    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX requirement_trip_id_idx ON requirement (trip_id, volgorde);

CREATE TRIGGER requirement_set_updated_at BEFORE UPDATE ON requirement
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
