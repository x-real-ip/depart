-- Up Migration

-- Elke tabel krijgt created_at en updated_at. updated_at wordt door een
-- trigger bijgehouden, zodat de applicatiecode er niet aan hoeft te denken.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE trip (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam          text NOT NULL,
  bestemming    text NOT NULL,
  land          text NOT NULL,
  regio         text,
  vertrekdatum  date NOT NULL,
  terugdatum    date NOT NULL,
  camping_naam  text,
  plaatsnummer  text,
  plaats_info   text,
  afstand_km    integer,
  rijtijd_min   integer,
  tol_kosten    numeric(10, 2),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_datums_op_orde CHECK (terugdatum >= vertrekdatum)
);

CREATE TABLE traveler (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id       uuid NOT NULL REFERENCES trip (id) ON DELETE CASCADE,
  naam          text NOT NULL,
  geboortejaar  integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX traveler_trip_id_idx ON traveler (trip_id);

-- traveler_id NULL betekent: hoort bij het hele gezin of bij de auto.
CREATE TABLE document (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id       uuid NOT NULL REFERENCES trip (id) ON DELETE CASCADE,
  traveler_id   uuid REFERENCES traveler (id) ON DELETE CASCADE,
  type          text NOT NULL,
  omschrijving  text,
  geldig_tot    date,
  -- Pad relatief aan DOCUMENTS_PATH. Het bestand zelf staat op het gemounte
  -- volume, niet in de database.
  bestandspad   text,
  bestandsnaam  text,
  mimetype      text,
  grootte       bigint,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Of er is geen bestand, of alle bestandsvelden zijn gevuld.
  CONSTRAINT document_bestand_compleet CHECK (
    (bestandspad IS NULL AND bestandsnaam IS NULL AND mimetype IS NULL AND grootte IS NULL)
    OR (bestandspad IS NOT NULL AND bestandsnaam IS NOT NULL AND mimetype IS NOT NULL AND grootte IS NOT NULL)
  )
);

CREATE INDEX document_trip_id_idx ON document (trip_id);
CREATE INDEX document_traveler_id_idx ON document (traveler_id);

CREATE TABLE pack_item (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id       uuid NOT NULL REFERENCES trip (id) ON DELETE CASCADE,
  traveler_id   uuid REFERENCES traveler (id) ON DELETE CASCADE,
  groep         text NOT NULL,
  label         text NOT NULL,
  afgevinkt     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pack_item_groep_bekend CHECK (groep IN ('uitrusting', 'koffer')),
  -- Uitrusting is gezamenlijk en hoort dus bij niemand; een koffer hoort
  -- altijd bij één reiziger.
  CONSTRAINT pack_item_groep_past_bij_reiziger CHECK (
    (groep = 'uitrusting' AND traveler_id IS NULL)
    OR (groep = 'koffer' AND traveler_id IS NOT NULL)
  )
);

CREATE INDEX pack_item_trip_id_idx ON pack_item (trip_id);

CREATE TABLE stop (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id       uuid NOT NULL REFERENCES trip (id) ON DELETE CASCADE,
  plaats        text NOT NULL,
  -- Geplande tijd als HH:MM. Geen timestamp: het gaat om een klokstand op de
  -- route, niet om een moment in een tijdzone.
  tijd          text,
  opmerking     text,
  volgorde      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stop_tijd_is_hhmm CHECK (tijd IS NULL OR tijd ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

CREATE INDEX stop_trip_id_volgorde_idx ON stop (trip_id, volgorde);

CREATE TABLE contact (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         uuid NOT NULL REFERENCES trip (id) ON DELETE CASCADE,
  label           text NOT NULL,
  telefoonnummer  text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contact_trip_id_idx ON contact (trip_id);

CREATE TRIGGER trip_set_updated_at BEFORE UPDATE ON trip
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER traveler_set_updated_at BEFORE UPDATE ON traveler
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER document_set_updated_at BEFORE UPDATE ON document
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER pack_item_set_updated_at BEFORE UPDATE ON pack_item
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER stop_set_updated_at BEFORE UPDATE ON stop
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER contact_set_updated_at BEFORE UPDATE ON contact
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS contact;
DROP TABLE IF EXISTS stop;
DROP TABLE IF EXISTS pack_item;
DROP TABLE IF EXISTS document;
DROP TABLE IF EXISTS traveler;
DROP TABLE IF EXISTS trip;
DROP FUNCTION IF EXISTS set_updated_at;
