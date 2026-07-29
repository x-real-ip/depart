/**
 * De enige laag die met de server praat. De rest van de app roept nooit
 * rechtstreeks fetch aan.
 *
 * nginx (productie) of de Vite-proxy (lokaal) stuurt /api door naar de api.
 * Er staat dus nergens een hostnaam in de code.
 *
 * De optionele bearer-token komt uit window.__ENV__ (env.js), dat bij het
 * opstarten van de container uit API_TOKEN gerenderd wordt.
 */

declare global {
  interface Window {
    __ENV__?: { API_TOKEN?: string; APP_TITLE?: string };
  }
}

const TOKEN = window.__ENV__?.API_TOKEN?.trim() || "";

export const APP_TITLE = window.__ENV__?.APP_TITLE?.trim() || "Depart";

/** Een fout van de api, met de melding die de server teruggaf. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const result = { ...extra };
  if (TOKEN) result["Authorization"] = `Bearer ${TOKEN}`;
  return result;
}

async function verwerk(response: Response): Promise<unknown> {
  if (response.status === 204) return null;

  const tekst = await response.text();
  let body: unknown = null;
  if (tekst !== "") {
    try {
      body = JSON.parse(tekst);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const melding =
      (body as { error?: string } | null)?.error ?? "Er ging iets mis bij het opslaan";
    throw new ApiError(melding, response.status);
  }
  return body;
}

async function verzoek(methode: string, pad: string, body?: unknown): Promise<unknown> {
  const response = await fetch(pad, {
    method: methode,
    headers: body === undefined ? headers() : headers({ "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return verwerk(response);
}

// --- Gegevenstypen, gelijk aan wat de api teruggeeft ----------------------

export type DocumentStatus = "ontbreekt" | "let op" | "geldig";

export interface Trip {
  id: string;
  naam: string;
  vertrekdatum: string;
  terugdatum: string;
  afstandKm: number | null;
  rijtijdMin: number | null;
  tolKosten: number | null;
  /** Waar de reis begint. Vertrekpunt voor de route en plaats voor het weer thuis. */
  thuisplaats: string | null;
  thuisland: string | null;
  /** Preciezer, via autocomplete gekozen adres — voor de route en de kaart. */
  thuisAdres: string | null;
  /** Of er coördinaten bij dit adres horen (een gekozen suggestie, of eerder al opgezocht). */
  thuisAdresGeverifieerd: boolean;
}

export interface TripMetReizigers extends Trip {
  reizigers: Traveler[];
}

export interface Traveler {
  id: string;
  tripId: string;
  naam: string;
  geboortejaar: number | null;
}

export interface DocumentItem {
  id: string;
  tripId: string;
  travelerId: string | null;
  type: string;
  omschrijving: string | null;
  geldigTot: string | null;
  bestandsnaam: string | null;
  mimetype: string | null;
  grootte: number | null;
  heeftBestand: boolean;
  status: DocumentStatus;
}

/** Een zelfgekozen inpaklijst — Uitrusting, Boodschappen, Fotografie, wat dan ook. */
export interface PackList {
  id: string;
  tripId: string;
  naam: string;
  /** Optioneel: deze lijst hoort bij één reiziger. */
  travelerId: string | null;
}

export interface PackItem {
  id: string;
  tripId: string;
  packListId: string;
  label: string;
  afgevinkt: boolean;
  volgorde: number;
  categorie: string | null;
}

/** Startset voor een nieuwe lijst: kampeer-basisuitrusting of persoonlijke spullen. */
export type StandaardSoort = "uitrusting" | "persoonlijk";

/** Een zelfgekozen takenlijst, optioneel bij één reiziger — los van de inpaklijsten. */
export interface TaskList {
  id: string;
  tripId: string;
  naam: string;
  travelerId: string | null;
}

export interface TaskItem {
  id: string;
  tripId: string;
  taskListId: string;
  label: string;
  afgevinkt: boolean;
  volgorde: number;
}

/**
 * Een plek waar je bent tijdens de reis — van een korte tussenstop tot de
 * eindbestemming. Hetzelfde soort ding, alleen met meer of minder ingevuld:
 * een tussenstop heeft misschien alleen een plaats en een inchecktijd, een
 * meerdaags verblijf heeft er ook een adres en incheck-/uitcheckdatum bij.
 * Geordend op `volgorde`; de laatste is de eindbestemming van de reis.
 */
export interface Destination {
  id: string;
  tripId: string;
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
  /** Of dit adres coördinaten heeft — via een gekozen suggestie. */
  adresGeverifieerd: boolean;
  /** Alleen als beide datums ingevuld zijn; anders is er niets te tellen. */
  nachten: number | null;
}

export interface NieuweDestination {
  naam?: string | null;
  plaats: string;
  land?: string | null;
  regio?: string | null;
  adres?: string | null;
  plaatsnummer?: string | null;
  opmerking?: string | null;
  incheckdatum?: string | null;
  inchecktijd?: string | null;
  uitcheckdatum?: string | null;
  uitchecktijd?: string | null;
  lat?: number | null;
  lon?: number | null;
}

/** Een adres-suggestie uit de autocomplete: altijd met coördinaten. */
export interface AdresSuggestie {
  label: string;
  straat: string | null;
  huisnummer: string | null;
  postcode: string | null;
  plaats: string | null;
  land: string | null;
  lat: number;
  lon: number;
}

// --- Actuele reisinformatie ------------------------------------------------

export interface WeerDag {
  datum: string;
  maxTemp: number | null;
  minTemp: number | null;
  windKmh: number | null;
  regenkans: number | null;
  /** WMO-weercode (0 = onbewolkt, 61 = regen, 95 = onweer, ...) voor een icoon. */
  weercode: number | null;
}

export interface WeerReeks {
  plaats: string;
  dagen: WeerDag[];
  /** False als de reis nog te ver weg is voor een verwachting. */
  dektVerblijf: boolean;
}

export interface WeerAntwoord {
  bestemming: WeerReeks | null;
  thuis: WeerReeks | null;
  /** Reden per plaats: de een kan lukken terwijl de ander mislukt. */
  bestemmingReden: string;
  thuisReden: string;
  /** Overkoepelend: "ok" zodra er minstens één reeks is. */
  reden: string;
}

export interface RouteEtappe {
  vanaf: string;
  naar: string;
  afstandKm: number;
  rijtijdMin: number;
}

export interface RouteInfo {
  etappes: RouteEtappe[];
  totaalAfstandKm: number;
  totaalRijtijdMin: number;
  /** De weg zelf, als [lat, lon]-punten — voor de lijn op de kaart. */
  geometrie: [number, number][];
}

/** Eén bezienswaardigheid in de buurt van de eindbestemming. */
export interface Bezienswaardigheid {
  naam: string;
  categorie: string;
  afstandKm: number;
  openingstijden: string | null;
  lat: number;
  lon: number;
}

export interface BezienswaardighedenAntwoord {
  bezienswaardigheden: Bezienswaardigheid[];
  reden: string;
}

/** Eén actueel verkeersincident: file, ongeluk, wegwerkzaamheden, en zo. */
export interface VerkeersIncident {
  categorie: string;
  ernst: string;
  omschrijving: string | null;
  vertragingMin: number | null;
  weg: string | null;
  van: string | null;
  naar: string | null;
  beginTijd: string | null;
  eindTijd: string | null;
  lat: number | null;
  lon: number | null;
}

export interface VerkeerAntwoord {
  incidenten: VerkeersIncident[];
  reden: string;
}

/** Eén onderdeel van de tolschatting: een land, met per-km- of vignetkosten. */
export interface TolOnderdeel {
  land: string;
  soort: "per-km" | "vignet";
  km: number | null;
  bedragEUR: number;
}

export interface TolSchatting {
  totaalEUR: number;
  onderdelen: TolOnderdeel[];
}

export interface TolAntwoord {
  schatting: TolSchatting | null;
  reden: string;
}

export type PuntRol = "thuis" | "onderweg" | "bestemming";

/** Eén punt op de kaart: thuis, een tussenliggende bestemming, of de eindbestemming. */
export interface RoutePunt {
  naam: string;
  rol: PuntRol;
  lat: number;
  lon: number;
}

export interface RouteAntwoord {
  route: RouteInfo | null;
  reden: string;
  /** Aantal tussenliggende bestemmingen (niet de eerste of de laatste). */
  onderweg?: number;
  /** Leeg zolang er geen coördinaten bekend zijn; anders altijd gevuld, ook als de route zelf niet lukte. */
  punten: RoutePunt[];
}

/** Melding bij een reden waarom er geen gegevens zijn. */
export const REDEN_TEKST: Record<string, string> = {
  uitgeschakeld: "De koppeling met externe diensten staat uit.",
  "geen-thuisplaats": "Vul eerst je thuisplaats in bij de instellingen.",
  "geen-bestemming": "Voeg eerst een bestemming toe.",
  "plaats-niet-gevonden": "Deze plaatsnaam is niet gevonden. Probeer een grotere plaats in de buurt.",
  "dienst-onbereikbaar":
    "De dienst is nu niet bereikbaar — dit ligt niet aan je invoer. Probeer het later opnieuw.",
  "te-weinig-punten": "Er zijn te weinig punten voor een route.",
  "geen-sleutel": "Deze functie is niet ingesteld voor deze app.",
};

/** Korte variant voor naast een plaatsnaam. */
export const REDEN_KORT: Record<string, string> = {
  uitgeschakeld: "koppeling staat uit",
  "geen-thuisplaats": "thuisplaats ontbreekt",
  "geen-bestemming": "geen bestemming",
  "plaats-niet-gevonden": "plaatsnaam niet gevonden",
  "dienst-onbereikbaar": "dienst niet bereikbaar",
  "geen-sleutel": "niet ingesteld",
};

export interface Contact {
  id: string;
  tripId: string;
  label: string;
  telefoonnummer: string;
}

export interface Voortgang {
  totaal: number;
  afgevinkt: number;
  percentage: number;
}

/** Een gerecht voor op de camping: een naam en, via RecipeIngredient, ingrediënten. */
export interface Recipe {
  id: string;
  tripId: string;
  naam: string;
}

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  label: string;
  volgorde: number;
}

export interface Overzicht {
  trip: Trip;
  documenten: { totaal: number; ontbreekt: number; letOp: number; geldig: number };
  /** Over alle inpaklijsten heen: hoeveel er zijn en hoe ver je bent. */
  inpaklijsten: Voortgang & { lijsten: number };
  /** Over alle takenlijsten heen — zelfde soort cijfer, los van de inpaklijsten. */
  taken: Voortgang & { lijsten: number };
  onderweg: { bestemmingen: number; noodnummers: number };
}

export interface NieuweTrip {
  naam: string;
  vertrekdatum: string;
  terugdatum: string;
  afstandKm?: number | null;
  rijtijdMin?: number | null;
  tolKosten?: number | null;
  thuisplaats?: string | null;
  thuisland?: string | null;
  thuisAdres?: string | null;
  thuisLat?: number | null;
  thuisLon?: number | null;
  /** De eerste bestemming van de reis; meer kunnen daarna toegevoegd worden. */
  bestemming: NieuweDestination;
  reizigers?: { naam: string; geboortejaar: number | null }[];
}

// --- Reizen ---------------------------------------------------------------

export const api = {
  trips: {
    lijst: () => verzoek("GET", "/api/trips") as Promise<Trip[]>,
    haal: (id: string) => verzoek("GET", `/api/trips/${id}`) as Promise<TripMetReizigers>,
    maak: (trip: NieuweTrip) => verzoek("POST", "/api/trips", trip) as Promise<TripMetReizigers>,
    werkBij: (id: string, velden: Partial<NieuweTrip>) =>
      verzoek("PATCH", `/api/trips/${id}`, velden) as Promise<Trip>,
    verwijder: (id: string) => verzoek("DELETE", `/api/trips/${id}`) as Promise<null>,
    overzicht: (id: string) => verzoek("GET", `/api/trips/${id}/overzicht`) as Promise<Overzicht>,
  },

  reizigers: {
    lijst: (tripId: string) =>
      verzoek("GET", `/api/trips/${tripId}/travelers`) as Promise<Traveler[]>,
    voegToe: (tripId: string, naam: string, geboortejaar: number | null) =>
      verzoek("POST", `/api/trips/${tripId}/travelers`, { naam, geboortejaar }) as Promise<Traveler>,
    werkBij: (id: string, velden: { naam?: string; geboortejaar?: number | null }) =>
      verzoek("PATCH", `/api/travelers/${id}`, velden) as Promise<Traveler>,
    verwijder: (id: string) => verzoek("DELETE", `/api/travelers/${id}`) as Promise<null>,
  },

  documenten: {
    lijst: (tripId: string) =>
      verzoek("GET", `/api/trips/${tripId}/documents`) as Promise<DocumentItem[]>,
    types: () => verzoek("GET", "/api/documenttypes") as Promise<string[]>,
    maak: (
      tripId: string,
      velden: { type: string; travelerId: string | null; geldigTot: string | null; omschrijving?: string | null },
    ) => verzoek("POST", `/api/trips/${tripId}/documents`, velden) as Promise<DocumentItem>,
    standaardtypes: (tripId: string) =>
      verzoek("POST", `/api/trips/${tripId}/documents/standaardtypes`, {}) as Promise<{
        toegevoegd: number;
        documenten: DocumentItem[];
      }>,
    werkBij: (
      id: string,
      velden: { type?: string; travelerId?: string | null; geldigTot?: string | null },
    ) => verzoek("PATCH", `/api/documents/${id}`, velden) as Promise<DocumentItem>,
    verwijder: (id: string) => verzoek("DELETE", `/api/documents/${id}`) as Promise<null>,
    verwijderBestand: (id: string) =>
      verzoek("DELETE", `/api/documents/${id}/bestand`) as Promise<DocumentItem>,

    /** Uploadt het bestand. Multipart, dus geen JSON-header. */
    async uploadBestand(id: string, bestand: File): Promise<DocumentItem> {
      const formulier = new FormData();
      formulier.append("bestand", bestand);
      const response = await fetch(`/api/documents/${id}/bestand`, {
        method: "POST",
        headers: headers(),
        body: formulier,
      });
      return (await verwerk(response)) as DocumentItem;
    },

    /**
     * Haalt het bestand op als blob, om het in een nieuw tabblad te openen.
     * Bewust geen kant-en-klare URL: een <a href> of window.open stuurt de
     * Authorization-header niet mee zodra er een token is gezet. Het bestand
     * gaat altijd via de api op het document-id — nooit een raadbare URL naar
     * een statisch bestand.
     */
    async bestandBlobUrl(id: string): Promise<string> {
      const response = await fetch(`/api/documents/${id}/bestand`, { headers: headers() });
      if (!response.ok) {
        throw new ApiError("Dit bestand is niet op te halen", response.status);
      }
      return URL.createObjectURL(await response.blob());
    },
  },

  /** Eigen inpaklijsten: elke lijst heeft een naam die je zelf kiest. */
  inpaklijsten: {
    lijst: (tripId: string) =>
      verzoek("GET", `/api/trips/${tripId}/pack-lists`) as Promise<PackList[]>,
    maak: (tripId: string, naam: string, travelerId: string | null) =>
      verzoek("POST", `/api/trips/${tripId}/pack-lists`, { naam, travelerId }) as Promise<PackList>,
    werkBij: (id: string, velden: { naam?: string; travelerId?: string | null }) =>
      verzoek("PATCH", `/api/pack-lists/${id}`, velden) as Promise<PackList>,
    verwijder: (id: string) => verzoek("DELETE", `/api/pack-lists/${id}`) as Promise<null>,
    standaardlijst: (id: string, soort: StandaardSoort) =>
      verzoek("POST", `/api/pack-lists/${id}/standaardlijst`, { soort }) as Promise<{
        toegevoegd: number;
        items: PackItem[];
      }>,
    wisVinkjes: (id: string) =>
      verzoek("POST", `/api/pack-lists/${id}/wis-vinkjes`, {}) as Promise<{ gewist: number }>,
    /** Plak een bestaande lijst (één item per regel) om 'm in te importeren. */
    importeer: (id: string, tekst: string) =>
      verzoek("POST", `/api/pack-lists/${id}/importeer`, { tekst }) as Promise<{
        toegevoegd: number;
        overgeslagen: number;
        items: PackItem[];
      }>,
  },

  inpaklijstItems: {
    lijst: (tripId: string) =>
      verzoek("GET", `/api/trips/${tripId}/pack-items`) as Promise<PackItem[]>,
    voegToe: (packListId: string, label: string, categorie?: string | null) =>
      verzoek("POST", `/api/pack-lists/${packListId}/pack-items`, {
        label,
        categorie: categorie ?? null,
      }) as Promise<PackItem>,
    werkBij: (id: string, velden: { label?: string; afgevinkt?: boolean; categorie?: string | null }) =>
      verzoek("PATCH", `/api/pack-items/${id}`, velden) as Promise<PackItem>,
    verwijder: (id: string) => verzoek("DELETE", `/api/pack-items/${id}`) as Promise<null>,
    herorden: (packListId: string, ids: string[]) =>
      verzoek("PUT", `/api/pack-lists/${packListId}/pack-items/volgorde`, { ids }) as Promise<
        PackItem[]
      >,
  },

  /** Eigen takenlijsten: dingen die vóór vertrek moeten gebeuren, los van de inpaklijsten. */
  taken: {
    lijst: (tripId: string) =>
      verzoek("GET", `/api/trips/${tripId}/task-lists`) as Promise<TaskList[]>,
    maak: (tripId: string, naam: string, travelerId: string | null) =>
      verzoek("POST", `/api/trips/${tripId}/task-lists`, { naam, travelerId }) as Promise<TaskList>,
    werkBij: (id: string, velden: { naam?: string; travelerId?: string | null }) =>
      verzoek("PATCH", `/api/task-lists/${id}`, velden) as Promise<TaskList>,
    verwijder: (id: string) => verzoek("DELETE", `/api/task-lists/${id}`) as Promise<null>,
    standaardlijst: (id: string) =>
      verzoek("POST", `/api/task-lists/${id}/standaardlijst`, {}) as Promise<{
        toegevoegd: number;
        items: TaskItem[];
      }>,
    wisVinkjes: (id: string) =>
      verzoek("POST", `/api/task-lists/${id}/wis-vinkjes`, {}) as Promise<{ gewist: number }>,
    /** Plak een bestaande lijst (één taak per regel) om 'm in te importeren. */
    importeer: (id: string, tekst: string) =>
      verzoek("POST", `/api/task-lists/${id}/importeer`, { tekst }) as Promise<{
        toegevoegd: number;
        overgeslagen: number;
        items: TaskItem[];
      }>,
  },

  taakItems: {
    lijst: (tripId: string) =>
      verzoek("GET", `/api/trips/${tripId}/task-items`) as Promise<TaskItem[]>,
    voegToe: (taskListId: string, label: string) =>
      verzoek("POST", `/api/task-lists/${taskListId}/task-items`, { label }) as Promise<TaskItem>,
    werkBij: (id: string, velden: { label?: string; afgevinkt?: boolean }) =>
      verzoek("PATCH", `/api/task-items/${id}`, velden) as Promise<TaskItem>,
    verwijder: (id: string) => verzoek("DELETE", `/api/task-items/${id}`) as Promise<null>,
    herorden: (taskListId: string, ids: string[]) =>
      verzoek("PUT", `/api/task-lists/${taskListId}/task-items/volgorde`, { ids }) as Promise<
        TaskItem[]
      >,
  },

  /** Bestemmingen: van thuis tot de eindbestemming, in volgorde. */
  destinations: {
    lijst: (tripId: string) =>
      verzoek("GET", `/api/trips/${tripId}/destinations`) as Promise<Destination[]>,
    voegToe: (tripId: string, velden: NieuweDestination) =>
      verzoek("POST", `/api/trips/${tripId}/destinations`, velden) as Promise<Destination>,
    werkBij: (id: string, velden: Partial<NieuweDestination>) =>
      verzoek("PATCH", `/api/destinations/${id}`, velden) as Promise<Destination>,
    herorden: (tripId: string, ids: string[]) =>
      verzoek("PUT", `/api/trips/${tripId}/destinations/volgorde`, { ids }) as Promise<
        Destination[]
      >,
    verwijder: (id: string) => verzoek("DELETE", `/api/destinations/${id}`) as Promise<null>,
  },

  /** Actuele gegevens van buiten: weer op de bestemming en thuis, en de route. */
  reisinfo: {
    weer: (tripId: string) => verzoek("GET", `/api/trips/${tripId}/weer`) as Promise<WeerAntwoord>,
    route: (tripId: string) =>
      verzoek("GET", `/api/trips/${tripId}/route`) as Promise<RouteAntwoord>,
    /** Zet de berekende afstand en rijtijd in de reis. */
    routeOvernemen: (tripId: string) =>
      verzoek("POST", `/api/trips/${tripId}/route/overnemen`, {}) as Promise<{
        overgenomen: boolean;
        reden: string;
        afstandKm?: number | null;
        rijtijdMin?: number | null;
      }>,
    bezienswaardigheden: (tripId: string) =>
      verzoek("GET", `/api/trips/${tripId}/bezienswaardigheden`) as Promise<
        BezienswaardighedenAntwoord
      >,
    verkeer: (tripId: string) =>
      verzoek("GET", `/api/trips/${tripId}/verkeer`) as Promise<VerkeerAntwoord>,
    tol: (tripId: string) => verzoek("GET", `/api/trips/${tripId}/tol`) as Promise<TolAntwoord>,
    /** Zelfde soort gegevens als route/verkeer/tol, maar dan voor de terugreis (omgekeerde route). */
    terugreisRoute: (tripId: string) =>
      verzoek("GET", `/api/trips/${tripId}/terugreis/route`) as Promise<RouteAntwoord>,
    terugreisVerkeer: (tripId: string) =>
      verzoek("GET", `/api/trips/${tripId}/terugreis/verkeer`) as Promise<VerkeerAntwoord>,
    terugreisTol: (tripId: string) =>
      verzoek("GET", `/api/trips/${tripId}/terugreis/tol`) as Promise<TolAntwoord>,
  },

  /** Adres-autocomplete voor thuisadres, bestemming en overnachtingen. */
  adressen: {
    zoek: (zoekterm: string) =>
      verzoek("GET", `/api/adressen?q=${encodeURIComponent(zoekterm)}`) as Promise<
        AdresSuggestie[]
      >,
  },

  noodnummers: {
    lijst: (tripId: string) => verzoek("GET", `/api/trips/${tripId}/contacts`) as Promise<Contact[]>,
    voegToe: (tripId: string, label: string, telefoonnummer: string) =>
      verzoek("POST", `/api/trips/${tripId}/contacts`, { label, telefoonnummer }) as Promise<Contact>,
    werkBij: (id: string, velden: { label?: string; telefoonnummer?: string }) =>
      verzoek("PATCH", `/api/contacts/${id}`, velden) as Promise<Contact>,
    verwijder: (id: string) => verzoek("DELETE", `/api/contacts/${id}`) as Promise<null>,
  },

  /** Gerechten voor op de camping: een naam en de ingrediënten die erin gaan. */
  gerechten: {
    lijst: (tripId: string) =>
      verzoek("GET", `/api/trips/${tripId}/recipes`) as Promise<Recipe[]>,
    maak: (tripId: string, naam: string) =>
      verzoek("POST", `/api/trips/${tripId}/recipes`, { naam }) as Promise<Recipe>,
    werkBij: (id: string, velden: { naam?: string }) =>
      verzoek("PATCH", `/api/recipes/${id}`, velden) as Promise<Recipe>,
    verwijder: (id: string) => verzoek("DELETE", `/api/recipes/${id}`) as Promise<null>,
  },

  ingredienten: {
    lijst: (tripId: string) =>
      verzoek("GET", `/api/trips/${tripId}/recipe-ingredients`) as Promise<RecipeIngredient[]>,
    voegToe: (recipeId: string, label: string) =>
      verzoek("POST", `/api/recipes/${recipeId}/recipe-ingredients`, {
        label,
      }) as Promise<RecipeIngredient>,
    werkBij: (id: string, velden: { label?: string }) =>
      verzoek("PATCH", `/api/recipe-ingredients/${id}`, velden) as Promise<RecipeIngredient>,
    verwijder: (id: string) => verzoek("DELETE", `/api/recipe-ingredients/${id}`) as Promise<null>,
  },
};
