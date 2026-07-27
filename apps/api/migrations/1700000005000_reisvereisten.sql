-- Up Migration

-- Een platte checklist per reis: paspoort, rijbewijs, reisverzekering en
-- dergelijke. Geen aparte lijsten zoals bij het inpakken — één reis heeft er
-- maar één van, met een vaste startset die je zelf uitbreidt of inkort.
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

-- Down Migration

DROP TRIGGER IF EXISTS requirement_set_updated_at ON requirement;
DROP TABLE IF EXISTS requirement;
