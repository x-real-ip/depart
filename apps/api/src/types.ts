/**
 * De database gebruikt snake_case, de API camelCase. De omzetting staat hier,
 * op één plek, zodat een kolomnaam nooit per ongeluk in de JSON belandt.
 */

export type DocumentStatus = "ontbreekt" | "let op" | "geldig";

export interface TripRow {
  id: string;
  naam: string;
  vertrekdatum: string;
  terugdatum: string;
  afstand_km: number | null;
  rijtijd_min: number | null;
  tol_kosten: number | null;
  thuisplaats: string | null;
  thuisland: string | null;
  thuisadres: string | null;
  thuis_lat: number | null;
  thuis_lon: number | null;
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
  volgorde: number;
}

/** Een zelfgekozen takenlijst, optioneel bij één reiziger — los van de inpaklijsten. */
export interface TaskListRow {
  id: string;
  trip_id: string;
  naam: string;
  traveler_id: string | null;
}

export interface TaskItemRow {
  id: string;
  trip_id: string;
  task_list_id: string;
  label: string;
  afgevinkt: boolean;
  volgorde: number;
}

/**
 * Een plek waar je bent tijdens de reis — van een korte tussenstop tot de
 * eindbestemming. Verschil zit alleen in wat er ingevuld is: een tussenstop
 * heeft misschien alleen een plaats en een inchecktijd, een meerdaags verblijf
 * heeft er ook een adres en incheck-/uitcheckdatum bij. Geordend op `volgorde`;
 * de laatste in die volgorde is de eindbestemming van de reis.
 */
export interface DestinationRow {
  id: string;
  trip_id: string;
  naam: string | null;
  plaats: string;
  land: string | null;
  regio: string | null;
  adres: string | null;
  plaatsnummer: string | null;
  opmerking: string | null;
  incheckdatum: string | null;
  inchecktijd: string | null;
  uitcheckdatum: string | null;
  uitchecktijd: string | null;
  volgorde: number;
  lat: number | null;
  lon: number | null;
}

export interface ContactRow {
  id: string;
  trip_id: string;
  label: string;
  telefoonnummer: string;
}

/** Een gerecht voor op de camping — een naam en, via recipe_ingredient, ingrediënten. */
export interface RecipeRow {
  id: string;
  trip_id: string;
  naam: string;
}

export interface RecipeIngredientRow {
  id: string;
  recipe_id: string;
  label: string;
  volgorde: number;
}

export const tripColumns = `
  id, naam, vertrekdatum, terugdatum, afstand_km, rijtijd_min, tol_kosten,
  thuisplaats, thuisland, thuisadres, thuis_lat, thuis_lon,
  created_at, updated_at
`;

export function toTrip(row: TripRow) {
  return {
    id: row.id,
    naam: row.naam,
    vertrekdatum: row.vertrekdatum,
    terugdatum: row.terugdatum,
    afstandKm: row.afstand_km,
    rijtijdMin: row.rijtijd_min,
    tolKosten: row.tol_kosten,
    thuisplaats: row.thuisplaats,
    thuisland: row.thuisland,
    thuisAdres: row.thuisadres,
    // Geverifieerd betekent: er zijn coördinaten bij dit adres, via een
    // gekozen suggestie of eerder al opgezocht. Puur informatief voor de
    // instellingen — bij het bewerken houdt de app zelf de verificatiestatus
    // bij totdat er weer wordt opgeslagen.
    thuisAdresGeverifieerd: row.thuis_lat !== null,
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
    volgorde: row.volgorde,
  };
}

export function toTaskList(row: TaskListRow) {
  return {
    id: row.id,
    tripId: row.trip_id,
    naam: row.naam,
    travelerId: row.traveler_id,
  };
}

export function toTaskItem(row: TaskItemRow) {
  return {
    id: row.id,
    tripId: row.trip_id,
    taskListId: row.task_list_id,
    label: row.label,
    afgevinkt: row.afgevinkt,
    volgorde: row.volgorde,
  };
}

export function toDestination(row: DestinationRow) {
  return {
    id: row.id,
    tripId: row.trip_id,
    naam: row.naam,
    plaats: row.plaats,
    land: row.land,
    regio: row.regio,
    adres: row.adres,
    plaatsnummer: row.plaatsnummer,
    opmerking: row.opmerking,
    incheckdatum: row.incheckdatum,
    inchecktijd: row.inchecktijd,
    uitcheckdatum: row.uitcheckdatum,
    uitchecktijd: row.uitchecktijd,
    volgorde: row.volgorde,
    adresGeverifieerd: row.lat !== null,
    /** Alleen als beide datums ingevuld zijn; anders is er niets te tellen. */
    nachten:
      row.incheckdatum !== null && row.uitcheckdatum !== null
        ? nachtenTussen(row.incheckdatum, row.uitcheckdatum)
        : null,
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

export function toRecipe(row: RecipeRow) {
  return {
    id: row.id,
    tripId: row.trip_id,
    naam: row.naam,
  };
}

export function toRecipeIngredient(row: RecipeIngredientRow) {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    label: row.label,
    volgorde: row.volgorde,
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
export function nachtenTussen(van: string, tot: string): number {
  return Math.max(0, Math.round((Date.parse(`${tot}T00:00:00Z`) - Date.parse(`${van}T00:00:00Z`)) / 86_400_000));
}
