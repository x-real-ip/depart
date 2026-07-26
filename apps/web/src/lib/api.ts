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
  bestemming: string;
  land: string;
  regio: string | null;
  vertrekdatum: string;
  terugdatum: string;
  campingNaam: string | null;
  plaatsnummer: string | null;
  plaatsInfo: string | null;
  afstandKm: number | null;
  rijtijdMin: number | null;
  tolKosten: number | null;
  /** Waar de reis begint. Vertrekpunt voor de route en plaats voor het weer thuis. */
  thuisplaats: string | null;
  thuisland: string | null;
  /** Preciezer, via autocomplete gekozen adres — voor de route en de kaart. */
  thuisAdres: string | null;
  bestemmingAdres: string | null;
  /** Of er coördinaten bij dit adres horen (een gekozen suggestie, of eerder al opgezocht). */
  thuisAdresGeverifieerd: boolean;
  bestemmingAdresGeverifieerd: boolean;
  nachten: number;
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
}

/** Startset voor een nieuwe lijst: kampeer-basisuitrusting of persoonlijke spullen. */
export type StandaardSoort = "uitrusting" | "persoonlijk";

export interface Stop {
  id: string;
  tripId: string;
  plaats: string;
  tijd: string | null;
  opmerking: string | null;
  volgorde: number;
  /** Een overnachting onderweg, of alleen een tussenstop van een paar uur. */
  overnachting: boolean;
  adres: string | null;
  nachten: number | null;
  /** Of dit adres coördinaten heeft — via een gekozen suggestie. */
  adresGeverifieerd: boolean;
}

export interface NieuweStop {
  plaats: string;
  tijd: string | null;
  opmerking: string | null;
  overnachting: boolean;
  adres: string | null;
  nachten: number | null;
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

export type PuntRol = "thuis" | "overnachting" | "bestemming";

/** Eén punt op de kaart: thuis, een overnachting, of de bestemming. */
export interface RoutePunt {
  naam: string;
  rol: PuntRol;
  lat: number;
  lon: number;
}

export interface RouteAntwoord {
  route: RouteInfo | null;
  reden: string;
  overnachtingen?: number;
  /** Leeg zolang er geen coördinaten bekend zijn; anders altijd gevuld, ook als de route zelf niet lukte. */
  punten: RoutePunt[];
}

/** Melding bij een reden waarom er geen gegevens zijn. */
export const REDEN_TEKST: Record<string, string> = {
  uitgeschakeld: "De koppeling met externe diensten staat uit.",
  "geen-thuisplaats": "Vul eerst je thuisplaats in bij de instellingen.",
  "plaats-niet-gevonden": "Deze plaatsnaam is niet gevonden. Probeer een grotere plaats in de buurt.",
  "dienst-onbereikbaar":
    "De dienst is nu niet bereikbaar — dit ligt niet aan je invoer. Probeer het later opnieuw.",
  "te-weinig-punten": "Er zijn te weinig punten voor een route.",
};

/** Korte variant voor naast een plaatsnaam. */
export const REDEN_KORT: Record<string, string> = {
  uitgeschakeld: "koppeling staat uit",
  "geen-thuisplaats": "thuisplaats ontbreekt",
  "plaats-niet-gevonden": "plaatsnaam niet gevonden",
  "dienst-onbereikbaar": "dienst niet bereikbaar",
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

export interface Overzicht {
  trip: Trip;
  documenten: { totaal: number; ontbreekt: number; letOp: number; geldig: number };
  /** Over alle inpaklijsten heen: hoeveel er zijn en hoe ver je bent. */
  inpaklijsten: Voortgang & { lijsten: number };
  onderweg: { etappes: number; noodnummers: number };
}

export interface NieuweTrip {
  naam: string;
  bestemming: string;
  land: string;
  regio?: string | null;
  vertrekdatum: string;
  terugdatum: string;
  campingNaam?: string | null;
  plaatsnummer?: string | null;
  plaatsInfo?: string | null;
  afstandKm?: number | null;
  rijtijdMin?: number | null;
  tolKosten?: number | null;
  thuisplaats?: string | null;
  thuisland?: string | null;
  thuisAdres?: string | null;
  thuisLat?: number | null;
  thuisLon?: number | null;
  bestemmingAdres?: string | null;
  bestemmingLat?: number | null;
  bestemmingLon?: number | null;
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
  },

  inpaklijstItems: {
    lijst: (tripId: string) =>
      verzoek("GET", `/api/trips/${tripId}/pack-items`) as Promise<PackItem[]>,
    voegToe: (packListId: string, label: string) =>
      verzoek("POST", `/api/pack-lists/${packListId}/pack-items`, { label }) as Promise<PackItem>,
    werkBij: (id: string, velden: { label?: string; afgevinkt?: boolean }) =>
      verzoek("PATCH", `/api/pack-items/${id}`, velden) as Promise<PackItem>,
    verwijder: (id: string) => verzoek("DELETE", `/api/pack-items/${id}`) as Promise<null>,
  },

  etappes: {
    lijst: (tripId: string) => verzoek("GET", `/api/trips/${tripId}/stops`) as Promise<Stop[]>,
    voegToe: (tripId: string, velden: NieuweStop) =>
      verzoek("POST", `/api/trips/${tripId}/stops`, velden) as Promise<Stop>,
    werkBij: (id: string, velden: Partial<NieuweStop>) =>
      verzoek("PATCH", `/api/stops/${id}`, velden) as Promise<Stop>,
    herorden: (tripId: string, ids: string[]) =>
      verzoek("PUT", `/api/trips/${tripId}/stops/volgorde`, { ids }) as Promise<Stop[]>,
    verwijder: (id: string) => verzoek("DELETE", `/api/stops/${id}`) as Promise<null>,
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
};
