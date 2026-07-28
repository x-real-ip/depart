-- Up Migration

-- Gerechten voor op de camping: een naam en een lijst ingrediënten. Los van
-- de inpaklijsten — een gerecht is een vast receptje dat je opnieuw gebruikt,
-- een inpaklijst is de boodschappenlijst voor deze ene reis. De verbinding
-- tussen de twee is een actie (ingrediënten naar een inpaklijst zetten), geen
-- databaserelatie: eenmaal op de inpaklijst staan de items op zichzelf.
CREATE TABLE recipe (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid NOT NULL REFERENCES trip (id) ON DELETE CASCADE,
  naam        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recipe_trip_id_idx ON recipe (trip_id);

CREATE TRIGGER recipe_set_updated_at BEFORE UPDATE ON recipe
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE recipe_ingredient (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   uuid NOT NULL REFERENCES recipe (id) ON DELETE CASCADE,
  label       text NOT NULL,
  volgorde    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recipe_ingredient_recipe_id_idx ON recipe_ingredient (recipe_id, volgorde);

-- Down Migration

DROP TABLE IF EXISTS recipe_ingredient;
DROP TRIGGER IF EXISTS recipe_set_updated_at ON recipe;
DROP TABLE IF EXISTS recipe;
