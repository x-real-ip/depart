-- Up Migration

-- Eén bestemming was tot nu toe iets anders dan een overnachting onderweg: de
-- eerste woonde op de reis zelf (bestemming/camping_naam/...), de tweede was
-- een stop met overnachting = true. Dat waren in de kern altijd al hetzelfde
-- soort ding — een plek waar je verblijft — dus die twee gaan samen in één
-- tabel. Een gewone tussenstop (geen overnachting, geen adres) past in
-- dezelfde tabel: die vult dan alleen plaats, inchecktijd en opmerking.
CREATE TABLE destination (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id        uuid NOT NULL REFERENCES trip (id) ON DELETE CASCADE,
  naam           text,
  plaats         text NOT NULL,
  land           text,
  regio          text,
  adres          text,
  plaatsnummer   text,
  opmerking      text,
  incheckdatum   date,
  inchecktijd    text,
  uitcheckdatum  date,
  uitchecktijd   text,
  volgorde       integer NOT NULL DEFAULT 0,
  lat            numeric(9, 6),
  lon            numeric(9, 6),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT destination_inchecktijd_is_hhmm CHECK (
    inchecktijd IS NULL OR inchecktijd ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  CONSTRAINT destination_uitchecktijd_is_hhmm CHECK (
    uitchecktijd IS NULL OR uitchecktijd ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  CONSTRAINT destination_uitcheck_niet_voor_incheck CHECK (
    incheckdatum IS NULL OR uitcheckdatum IS NULL OR uitcheckdatum >= incheckdatum
  )
);

CREATE INDEX destination_trip_id_volgorde_idx ON destination (trip_id, volgorde);

CREATE TRIGGER destination_set_updated_at BEFORE UPDATE ON destination
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Alle bestaande stops (tussenstop of overnachting) worden bestemmingen, met
-- behoud van hun onderlinge volgorde.
INSERT INTO destination (trip_id, plaats, opmerking, inchecktijd, adres, lat, lon, volgorde)
SELECT trip_id, plaats, opmerking, tijd, adres, lat, lon, volgorde
FROM stop;

-- Een overnachting had een aantal nachten, geen datums. Die zetten we om naar
-- een incheck-/uitcheckdatum vanaf de vertrekdatum — een inschatting, niet een
-- exacte herberekening van de originele rit.
UPDATE destination d
SET incheckdatum = t.vertrekdatum,
    uitcheckdatum = t.vertrekdatum + (s.nachten || ' days')::interval
FROM stop s
JOIN trip t ON t.id = s.trip_id
WHERE s.overnachting = true
  AND s.trip_id = d.trip_id
  AND s.volgorde = d.volgorde;

-- De bestemming die op de reis zelf stond, wordt de laatste bestemming: dat
-- was altijd al het eindpunt van de route.
INSERT INTO destination (trip_id, naam, plaats, land, regio, adres, plaatsnummer, opmerking, volgorde, lat, lon)
SELECT
  t.id, t.camping_naam, t.bestemming, t.land, t.regio, t.bestemming_adres, t.plaatsnummer, t.plaats_info,
  COALESCE((SELECT max(d2.volgorde) + 1 FROM destination d2 WHERE d2.trip_id = t.id), 0),
  t.bestemming_lat, t.bestemming_lon
FROM trip t;

-- Volgorde-nummers netjes doorlopend maken (0, 1, 2, ...) per reis.
WITH genummerd AS (
  SELECT id, row_number() OVER (PARTITION BY trip_id ORDER BY volgorde ASC, created_at ASC) - 1 AS nieuw
  FROM destination
)
UPDATE destination d SET volgorde = g.nieuw
FROM genummerd g
WHERE g.id = d.id;

DROP TRIGGER IF EXISTS stop_set_updated_at ON stop;
DROP TABLE stop;

ALTER TABLE trip
  DROP COLUMN bestemming,
  DROP COLUMN land,
  DROP COLUMN regio,
  DROP COLUMN camping_naam,
  DROP COLUMN plaatsnummer,
  DROP COLUMN plaats_info,
  DROP COLUMN bestemming_adres,
  DROP COLUMN bestemming_lat,
  DROP COLUMN bestemming_lon;

-- Down Migration

ALTER TABLE trip
  ADD COLUMN bestemming text,
  ADD COLUMN land text,
  ADD COLUMN regio text,
  ADD COLUMN camping_naam text,
  ADD COLUMN plaatsnummer text,
  ADD COLUMN plaats_info text,
  ADD COLUMN bestemming_adres text,
  ADD COLUMN bestemming_lat numeric(9, 6),
  ADD COLUMN bestemming_lon numeric(9, 6);

-- De laatste bestemming (hoogste volgorde) per reis gaat terug naar de reis
-- zelf.
WITH laatste AS (
  SELECT DISTINCT ON (trip_id)
    trip_id, naam, plaats, land, regio, adres, plaatsnummer, opmerking, lat, lon
  FROM destination
  ORDER BY trip_id, volgorde DESC
)
UPDATE trip t SET
  bestemming = l.plaats,
  land = COALESCE(l.land, ''),
  regio = l.regio,
  camping_naam = l.naam,
  plaatsnummer = l.plaatsnummer,
  plaats_info = l.opmerking,
  bestemming_adres = l.adres,
  bestemming_lat = l.lat,
  bestemming_lon = l.lon
FROM laatste l
WHERE l.trip_id = t.id;

ALTER TABLE trip
  ALTER COLUMN bestemming SET NOT NULL,
  ALTER COLUMN land SET NOT NULL;

CREATE TABLE stop (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id       uuid NOT NULL REFERENCES trip (id) ON DELETE CASCADE,
  plaats        text NOT NULL,
  tijd          text,
  opmerking     text,
  volgorde      integer NOT NULL DEFAULT 0,
  overnachting  boolean NOT NULL DEFAULT false,
  adres         text,
  nachten       integer,
  lat           numeric(9, 6),
  lon           numeric(9, 6),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stop_tijd_is_hhmm CHECK (tijd IS NULL OR tijd ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT stop_nachten_alleen_bij_overnachting CHECK (
    (overnachting = false AND nachten IS NULL)
    OR (overnachting = true AND nachten IS NOT NULL AND nachten >= 1)
  )
);

CREATE TRIGGER stop_set_updated_at BEFORE UPDATE ON stop
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Elke bestemming behalve de laatste (die terugging naar trip.bestemming)
-- wordt weer een gewone stop.
WITH gerangschikt AS (
  SELECT *, row_number() OVER (PARTITION BY trip_id ORDER BY volgorde DESC) AS positie_van_achteren
  FROM destination
)
INSERT INTO stop (trip_id, plaats, tijd, opmerking, volgorde, overnachting, adres, nachten, lat, lon)
SELECT
  trip_id,
  plaats,
  inchecktijd,
  opmerking,
  volgorde,
  (incheckdatum IS NOT NULL OR uitcheckdatum IS NOT NULL OR adres IS NOT NULL),
  adres,
  CASE
    WHEN incheckdatum IS NOT NULL AND uitcheckdatum IS NOT NULL
      THEN GREATEST(1, (uitcheckdatum - incheckdatum))
    WHEN incheckdatum IS NOT NULL OR uitcheckdatum IS NOT NULL OR adres IS NOT NULL THEN 1
    ELSE NULL
  END,
  lat,
  lon
FROM gerangschikt
WHERE positie_van_achteren > 1;

DROP TRIGGER IF EXISTS destination_set_updated_at ON destination;
DROP TABLE destination;
