/**
 * De database gebruikt snake_case, de API camelCase. De omzetting staat hier,
 * op één plek, zodat een kolomnaam nooit per ongeluk in de JSON belandt.
 */

export type DocumentStatus = "ontbreekt" | "let op" | "geldig";

export interface TripRow {
  id: string;
  naam: string;
  bestemming: string;
  land: string;
  regio: string | null;
  vertrekdatum: string;
  terugdatum: string;
  camping_naam: string | null;
  plaatsnummer: string | null;
  plaats_info: string | null;
  afstand_km: number | null;
  rijtijd_min: number | null;
  tol_kosten: number | null;
  thuisplaats: string | null;
  thuisland: string | null;
  thuisadres: string | null;
  thuis_lat: number | null;
  thuis_lon: number | null;
  bestemming_adres: string | null;
  bestemming_lat: number | null;
  bestemming_lon: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface TravelerRow {
  id: string;
  trip_id: string;
  naam: string;
  geboortejaar: number | null;
}

export interface DocumentRow {
  id: string;
  trip_id: string;
  traveler_id: string | null;
  type: string;
  omschrijving: string | null;
  geldig_tot: string | null;
  bestandspad: string | null;
  bestandsnaam: string | null;
  mimetype: string | null;
  grootte: number | null;
}

/** Een zelfgekozen inpaklijst, optioneel bij één reiziger. */
export interface PackListRow {
  id: string;
  trip_id: string;
  naam: string;
  traveler_id: string | null;
}

export interface PackItemRow {
  id: string;
  trip_id: string;
  pack_list_id: string;
  label: string;
  afgevinkt: boolean;
}

export interface StopRow {
  id: string;
  trip_id: string;
  plaats: string;
  tijd: string | null;
  opmerking: string | null;
  volgorde: number;
  overnachting: boolean;
  adres: string | null;
  nachten: number | null;
  lat: number | null;
  lon: number | null;
}

export interface ContactRow {
  id: string;
  trip_id: string;
  label: string;
  telefoonnummer: string;
}

export const tripColumns = `
  id, naam, bestemming, land, regio, vertrekdatum, terugdatum,
  camping_naam, plaatsnummer, plaats_info, afstand_km, rijtijd_min, tol_kosten,
  thuisplaats, thuisland, thuisadres, thuis_lat, thuis_lon,
  bestemming_adres, bestemming_lat, bestemming_lon,
  created_at, updated_at
`;

export function toTrip(row: TripRow) {
  return {
    id: row.id,
    naam: row.naam,
    bestemming: row.bestemming,
    land: row.land,
    regio: row.regio,
    vertrekdatum: row.vertrekdatum,
    terugdatum: row.terugdatum,
    campingNaam: row.camping_naam,
    plaatsnummer: row.plaatsnummer,
    plaatsInfo: row.plaats_info,
    afstandKm: row.afstand_km,
    rijtijdMin: row.rijtijd_min,
    tolKosten: row.tol_kosten,
    thuisplaats: row.thuisplaats,
    thuisland: row.thuisland,
    thuisAdres: row.thuisadres,
    bestemmingAdres: row.bestemming_adres,
    // Geverifieerd betekent: er zijn coördinaten bij dit adres, via een
    // gekozen suggestie of eerder al opgezocht. Puur informatief voor de
    // instellingen — bij het bewerken houdt de app zelf de verificatiestatus
    // bij totdat er weer wordt opgeslagen.
    thuisAdresGeverifieerd: row.thuis_lat !== null,
    bestemmingAdresGeverifieerd: row.bestemming_lat !== null,
    /** Aantal nachten op de camping, uit de datums berekend. */
    nachten: nachtenTussen(row.vertrekdatum, row.terugdatum),
  };
}

export function toTraveler(row: TravelerRow) {
  return {
    id: row.id,
    tripId: row.trip_id,
    naam: row.naam,
    geboortejaar: row.geboortejaar,
  };
}

export function toPackList(row: PackListRow) {
  return {
    id: row.id,
    tripId: row.trip_id,
    naam: row.naam,
    travelerId: row.traveler_id,
  };
}

export function toPackItem(row: PackItemRow) {
  return {
    id: row.id,
    tripId: row.trip_id,
    packListId: row.pack_list_id,
    label: row.label,
    afgevinkt: row.afgevinkt,
  };
}

export function toStop(row: StopRow) {
  return {
    id: row.id,
    tripId: row.trip_id,
    plaats: row.plaats,
    tijd: row.tijd,
    opmerking: row.opmerking,
    volgorde: row.volgorde,
    overnachting: row.overnachting,
    adres: row.adres,
    nachten: row.nachten,
    adresGeverifieerd: row.lat !== null,
  };
}

export function toContact(row: ContactRow) {
  return {
    id: row.id,
    tripId: row.trip_id,
    label: row.label,
    telefoonnummer: row.telefoonnummer,
  };
}

/**
 * Het document zoals de app het ziet. De status is berekend, niet opgeslagen:
 *
 * - ontbreekt: er is geen bestand geüpload
 * - let op:    geldigTot valt binnen zes maanden na de terugdatum van de reis
 * - geldig:    al het andere
 *
 * bestandspad gaat nooit mee naar de browser: waar het bestand op schijf staat
 * is niets voor de client. Het bestand komt via /api/documents/:id/bestand.
 */
export function toDocument(row: DocumentRow, terugdatum: string) {
  return {
    id: row.id,
    tripId: row.trip_id,
    travelerId: row.traveler_id,
    type: row.type,
    omschrijving: row.omschrijving,
    geldigTot: row.geldig_tot,
    bestandsnaam: row.bestandsnaam,
    mimetype: row.mimetype,
    grootte: row.grootte,
    heeftBestand: row.bestandspad !== null,
    status: documentStatus(row, terugdatum),
  };
}

export function documentStatus(row: DocumentRow, terugdatum: string): DocumentStatus {
  if (row.bestandspad === null) return "ontbreekt";
  if (row.geldig_tot === null) return "geldig";

  const grens = new Date(`${terugdatum}T00:00:00Z`);
  grens.setUTCMonth(grens.getUTCMonth() + 6);
  const geldigTot = new Date(`${row.geldig_tot}T00:00:00Z`);

  return geldigTot < grens ? "let op" : "geldig";
}

/** Aantal nachten tussen twee kalenderdagen. */
export function nachtenTussen(vertrekdatum: string, terugdatum: string): number {
  const van = Date.parse(`${vertrekdatum}T00:00:00Z`);
  const tot = Date.parse(`${terugdatum}T00:00:00Z`);
  return Math.max(0, Math.round((tot - van) / 86_400_000));
}
