-- Up Migration

-- Vrije tekst, bijvoorbeeld "Kleding" of "Drogisterij" — geen vaste lijst.
-- Leeg (null) betekent: geen categorie, komt in de app onder "Overig" terecht.
ALTER TABLE pack_item ADD COLUMN categorie text;

-- Down Migration

ALTER TABLE pack_item DROP COLUMN categorie;
