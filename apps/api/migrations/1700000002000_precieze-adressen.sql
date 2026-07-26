-- Up Migration

-- Naast de plaatsnaam (voor het weer en de koptekst) kan er straks een
-- preciezer, geverifieerd adres bij komen — vooral nuttig voor de route en de
-- kaart, waar het middelpunt van een stad net te grof is.
ALTER TABLE trip
  ADD COLUMN thuisadres text,
  ADD COLUMN bestemming_adres text;

-- Down Migration

ALTER TABLE trip
  DROP COLUMN IF EXISTS thuisadres,
  DROP COLUMN IF EXISTS bestemming_adres;
