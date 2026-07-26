-- Up Migration

-- Voorheen was er precies twee soorten inpaklijst: één gezamenlijke
-- ("uitrusting") en één vaste koffer per reiziger. Daarvoor komt een gewone
-- lijst-tabel: elke lijst heeft een eigen naam die je zelf kiest
-- (bijvoorbeeld "Uitrusting", "Boodschappen" of "Fotografie"), en mag
-- optioneel bij één reiziger horen — dat laatste is nu een keuze, geen regel.
CREATE TABLE pack_list (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      uuid NOT NULL REFERENCES trip (id) ON DELETE CASCADE,
  naam         text NOT NULL,
  traveler_id  uuid REFERENCES traveler (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pack_list_trip_id_idx ON pack_list (trip_id);

CREATE TRIGGER pack_list_set_updated_at BEFORE UPDATE ON pack_list
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE pack_item ADD COLUMN pack_list_id uuid REFERENCES pack_list (id) ON DELETE CASCADE;

-- Bestaande items krijgen een gegenereerde lijst per trip (voor "uitrusting")
-- of per trip+reiziger (voor de oude vaste koffer), zodat een omgeving met al
-- ingevulde reizen niets kwijtraakt.
INSERT INTO pack_list (trip_id, naam, traveler_id)
SELECT DISTINCT trip_id, 'Uitrusting', NULL::uuid
FROM pack_item
WHERE groep = 'uitrusting';

INSERT INTO pack_list (trip_id, naam, traveler_id)
SELECT DISTINCT pi.trip_id, 'Inpaklijst van ' || t.naam, pi.traveler_id
FROM pack_item pi
JOIN traveler t ON t.id = pi.traveler_id
WHERE pi.groep = 'koffer';

UPDATE pack_item pi
SET pack_list_id = pl.id
FROM pack_list pl
WHERE pi.groep = 'uitrusting'
  AND pl.trip_id = pi.trip_id
  AND pl.traveler_id IS NULL
  AND pl.naam = 'Uitrusting';

UPDATE pack_item pi
SET pack_list_id = pl.id
FROM pack_list pl
WHERE pi.groep = 'koffer'
  AND pl.trip_id = pi.trip_id
  AND pl.traveler_id = pi.traveler_id;

ALTER TABLE pack_item
  ALTER COLUMN pack_list_id SET NOT NULL,
  DROP CONSTRAINT pack_item_groep_bekend,
  DROP CONSTRAINT pack_item_groep_past_bij_reiziger,
  DROP COLUMN groep,
  DROP COLUMN traveler_id;

CREATE INDEX pack_item_pack_list_id_idx ON pack_item (pack_list_id);

-- Down Migration

ALTER TABLE pack_item
  ADD COLUMN groep text,
  ADD COLUMN traveler_id uuid REFERENCES traveler (id) ON DELETE CASCADE;

UPDATE pack_item pi
SET
  groep = CASE WHEN pl.traveler_id IS NULL THEN 'uitrusting' ELSE 'koffer' END,
  traveler_id = pl.traveler_id
FROM pack_list pl
WHERE pl.id = pi.pack_list_id;

ALTER TABLE pack_item
  ALTER COLUMN groep SET NOT NULL,
  ADD CONSTRAINT pack_item_groep_bekend CHECK (groep IN ('uitrusting', 'koffer')),
  ADD CONSTRAINT pack_item_groep_past_bij_reiziger CHECK (
    (groep = 'uitrusting' AND traveler_id IS NULL)
    OR (groep = 'koffer' AND traveler_id IS NOT NULL)
  ),
  DROP COLUMN pack_list_id;

DROP INDEX IF EXISTS pack_item_pack_list_id_idx;
DROP TRIGGER IF EXISTS pack_list_set_updated_at ON pack_list;
DROP TABLE IF EXISTS pack_list;
