-- Up Migration

-- Waar de reis begint. Nodig voor het weer thuis en als eerste punt van de
-- route; stond eerder als vaste waarde in de frontend.
ALTER TABLE trip
  ADD COLUMN thuisplaats text,
  ADD COLUMN thuisland text,
  -- Coördinaten worden bij het opzoeken van het weer of de route eenmalig
  -- opgezocht en hier bewaard, zodat we de geocoder niet elke keer bevragen.
  ADD COLUMN thuis_lat numeric(9, 6),
  ADD COLUMN thuis_lon numeric(9, 6),
  ADD COLUMN bestemming_lat numeric(9, 6),
  ADD COLUMN bestemming_lon numeric(9, 6);

-- Een etappe kan een tussenstop van een paar uur zijn, of een overnachting op
-- weg naar de eindbestemming.
ALTER TABLE stop
  ADD COLUMN overnachting boolean NOT NULL DEFAULT false,
  ADD COLUMN adres text,
  ADD COLUMN nachten integer,
  ADD COLUMN lat numeric(9, 6),
  ADD COLUMN lon numeric(9, 6);

ALTER TABLE stop
  ADD CONSTRAINT stop_nachten_alleen_bij_overnachting CHECK (
    (overnachting = false AND nachten IS NULL)
    OR (overnachting = true AND nachten IS NOT NULL AND nachten >= 1)
  );

-- Down Migration

ALTER TABLE stop
  DROP CONSTRAINT IF EXISTS stop_nachten_alleen_bij_overnachting;

ALTER TABLE stop
  DROP COLUMN IF EXISTS overnachting,
  DROP COLUMN IF EXISTS adres,
  DROP COLUMN IF EXISTS nachten,
  DROP COLUMN IF EXISTS lat,
  DROP COLUMN IF EXISTS lon;

ALTER TABLE trip
  DROP COLUMN IF EXISTS thuisplaats,
  DROP COLUMN IF EXISTS thuisland,
  DROP COLUMN IF EXISTS thuis_lat,
  DROP COLUMN IF EXISTS thuis_lon,
  DROP COLUMN IF EXISTS bestemming_lat,
  DROP COLUMN IF EXISTS bestemming_lon;
