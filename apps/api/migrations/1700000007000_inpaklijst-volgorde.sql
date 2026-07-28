-- Up Migration

-- Tot nu toe stond een inpaklijst altijd op volgorde van toevoegen — geen
-- keuze. Net als bij de bestemmingen krijgt elk item nu een eigen volgorde
-- die je kunt verslepen; bestaande items behouden hun huidige (chronologische)
-- volgorde als startpunt.
ALTER TABLE pack_item ADD COLUMN volgorde integer NOT NULL DEFAULT 0;

WITH genummerd AS (
  SELECT id, row_number() OVER (PARTITION BY pack_list_id ORDER BY created_at ASC) - 1 AS nieuw
  FROM pack_item
)
UPDATE pack_item pi SET volgorde = g.nieuw
FROM genummerd g
WHERE g.id = pi.id;

CREATE INDEX pack_item_pack_list_id_volgorde_idx ON pack_item (pack_list_id, volgorde);
DROP INDEX IF EXISTS pack_item_pack_list_id_idx;

-- Down Migration

DROP INDEX IF EXISTS pack_item_pack_list_id_volgorde_idx;
CREATE INDEX pack_item_pack_list_id_idx ON pack_item (pack_list_id);
ALTER TABLE pack_item DROP COLUMN volgorde;
