-- Up Migration

-- Losstaand van de inpaklijsten: dingen die moeten gebéuren voor vertrek
-- (post stopzetten, verzekering checken) horen niet tussen wat er in de tas
-- moet. Zelfde structuur als pack_list/pack_item — inclusief volgorde en de
-- optionele koppeling aan één reiziger — die heeft zich al bewezen.
CREATE TABLE task_list (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid NOT NULL REFERENCES trip (id) ON DELETE CASCADE,
  naam        text NOT NULL,
  traveler_id uuid REFERENCES traveler (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX task_list_trip_id_idx ON task_list (trip_id);

CREATE TRIGGER task_list_set_updated_at BEFORE UPDATE ON task_list
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE task_item (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid NOT NULL REFERENCES trip (id) ON DELETE CASCADE,
  task_list_id uuid NOT NULL REFERENCES task_list (id) ON DELETE CASCADE,
  label       text NOT NULL,
  afgevinkt   boolean NOT NULL DEFAULT false,
  volgorde    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX task_item_task_list_id_volgorde_idx ON task_item (task_list_id, volgorde);

-- Down Migration

DROP TABLE IF EXISTS task_item;
DROP TRIGGER IF EXISTS task_list_set_updated_at ON task_list;
DROP TABLE IF EXISTS task_list;
