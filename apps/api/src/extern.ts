import { config } from "./config.js";

/**
 * Weer, route en het opzoeken van coördinaten. Alle drie via publieke diensten
 * die zonder sleutel werken:
 *
 * - Open-Meteo geocoding  — plaatsnaam naar coördinaten
 * - Open-Meteo forecast   — dag- en nachttemperatuur, wind, regenkans
 * - OSRM                  — afstand en rijtijd per etappe
 * - Overpass (OpenStreetMap) — bezienswaardigheden rond de bestemming
 *
 * Regels die hier gelden:
 *
 * 1. Een externe dienst mag de app nooit stukmaken. Elke functie geeft null
 *    terug als er iets misgaat; de schermen tonen dan "niet beschikbaar".
 * 2. Antwoorden worden kort in het geheugen bewaard, zodat een pagina die
 *    tweemaal ververst niet tweemaal een publieke dienst belast.
 * 3. Er wordt niets naar buiten gestuurd behalve een plaatsnaam of coördinaat.
 *    Geen reisnamen, geen reizigers, geen documenten.
 */

export interface Coordinaat {
  lat: number;
  lon: number;
}

/** Waarom een plaats geen coördinaat opleverde. */
export type CoordinaatUitkomst =
  | { coordinaat: Coordinaat }
  | { fout: "niet-gevonden" | "onbereikbaar" };

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
  /** True als de reeks de dagen van het verblijf dekt, niet alleen vandaag. */
  dektVerblijf: boolean;
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
  /** De weg zelf, als [lat, lon]-punten, voor het tekenen van de lijn op de kaart. */
  geometrie: [number, number][];
}

/** Een adres-suggestie van de autocomplete: altijd met coördinaten. */
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

// --- Cache ----------------------------------------------------------------

interface CacheItem {
  waarde: unknown;
  verloopt: number;
}

const cache = new Map<string, CacheItem>();

function uitCache<T>(sleutel: string): T | undefined {
  const item = cache.get(sleutel);
  if (item === undefined) return undefined;
  if (item.verloopt < Date.now()) {
    cache.delete(sleutel);
    return undefined;
  }
  return item.waarde as T;
}

function inCache(sleutel: string, waarde: unknown): void {
  cache.set(sleutel, {
    waarde,
    verloopt: Date.now() + config.extern.cacheMinuten * 60_000,
  });
  // De cache mag niet onbeperkt groeien; dit is een app voor één gezin.
  if (cache.size > 200) {
    const oudste = cache.keys().next();
    if (!oudste.done) cache.delete(oudste.value);
  }
}

// --- Ophalen ---------------------------------------------------------------

/**
 * Het onderscheid tussen "de dienst antwoordde" en "de dienst was er niet" moet
 * bewaard blijven. Zonder dat verschil krijgt de gebruiker bij een storing te
 * horen dat zijn plaatsnaam niet bestaat, en gaat hij een probleem oplossen dat
 * er niet is.
 */
type Uitkomst<T> = { ok: true; data: T } | { ok: false };

/**
 * Haalt JSON op met een timeout. Een dienst die er niet is mag geen 500
 * opleveren, dus fouten komen terug als { ok: false }.
 */
async function haalJson<T>(url: string, waarvoor: string): Promise<Uitkomst<T>> {
  if (!config.extern.enabled) return { ok: false };

  const afbreken = AbortSignal.timeout(config.extern.timeoutMs);
  try {
    const response = await fetch(url, {
      signal: afbreken,
      headers: { "User-Agent": config.extern.userAgent, Accept: "application/json" },
    });
    if (!response.ok) {
      externeFout(waarvoor, `status ${response.status}`);
      return { ok: false };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    externeFout(waarvoor, foutReden(error));
    return { ok: false };
  }
}

/**
 * Een korte, bruikbare reden. fetch gooit bij netwerkproblemen een kale
 * TypeError; de echte oorzaak (ENOTFOUND, ECONNRESET) zit in `cause`. Zonder
 * die code is een logregel niets waard bij het zoeken naar een storing.
 */
function foutReden(error: unknown): string {
  if (!(error instanceof Error)) return "onbekend";
  if (error.name === "TimeoutError") return "timeout";

  // fetch verpakt de echte oorzaak in `cause`, en bij meerdere IP-adressen
  // (IPv4 en IPv6) is dat een AggregateError met een fout per poging.
  const detail = detailVan((error as { cause?: unknown }).cause);
  return detail === null ? error.name : `${error.name}: ${detail}`;
}

/**
 * De code als die er is (ENOTFOUND, ECONNREFUSED), anders de melding van de
 * oorzaak. Die bevat hoogstens het adres van de dienst zelf — dat staat in de
 * configuratie en is niets over de reis.
 */
function detailVan(oorzaak: unknown): string | null {
  if (typeof oorzaak !== "object" || oorzaak === null) return null;
  const details = oorzaak as { code?: string; message?: string; errors?: unknown[] };
  if (typeof details.code === "string") return details.code;
  for (const genest of details.errors ?? []) {
    const detail = detailVan(genest);
    if (detail !== null) return detail;
  }
  if (typeof details.message === "string" && details.message !== "") {
    return details.message.slice(0, 120);
  }
  return null;
}

/**
 * Externe fouten zijn geen applicatiefouten. Ze gaan naar de standaarduitvoer
 * met alleen de dienst en de soort fout — nooit de volledige URL, want die
 * bevat de plaatsnaam en dus iets over de reis.
 */
function externeFout(waarvoor: string, reden: string): void {
  process.stdout.write(
    `${JSON.stringify({ level: 30, msg: "externe dienst niet beschikbaar", dienst: waarvoor, reden })}\n`,
  );
}

// --- Coördinaten opzoeken --------------------------------------------------

interface GeocodingAntwoord {
  results?: { latitude: number; longitude: number; name: string; country_code?: string }[];
}

/**
 * Zoekt de coördinaten van een plaats. Het land maakt het antwoord
 * betrouwbaarder: er is een Parijs in Frankrijk en een Paris in Texas.
 */
export async function zoekCoordinaat(
  plaats: string,
  land?: string | null,
): Promise<CoordinaatUitkomst> {
  const sleutel = `geo:${plaats.toLowerCase()}|${(land ?? "").toLowerCase()}`;
  const bewaard = uitCache<Coordinaat>(sleutel);
  if (bewaard !== undefined) return { coordinaat: bewaard };

  const url = new URL(config.extern.geocodingUrl);
  url.searchParams.set("name", plaats);
  url.searchParams.set("count", "10");
  url.searchParams.set("language", "nl");
  url.searchParams.set("format", "json");

  const antwoord = await haalJson<GeocodingAntwoord>(url.toString(), "geocoding");
  // De dienst deed het niet. Dat is iets anders dan een onbekende plaats, en de
  // gebruiker hoort niet te horen dat hij zijn plaatsnaam moet aanpassen.
  if (!antwoord.ok) return { fout: "onbereikbaar" };

  const treffers = antwoord.data.results ?? [];
  if (treffers.length === 0) return { fout: "niet-gevonden" };

  // Bij een land: de eerste treffer in dat land. Anders de eerste treffer.
  const landcode = land === null || land === undefined ? null : landnaarCode(land);
  const treffer =
    (landcode !== null
      ? treffers.find((r) => r.country_code?.toUpperCase() === landcode)
      : undefined) ?? treffers[0]!;

  const coordinaat: Coordinaat = { lat: treffer.latitude, lon: treffer.longitude };
  inCache(sleutel, coordinaat);
  return { coordinaat };
}

/** Landnamen zoals de app ze gebruikt, naar ISO-landcode. */
const LANDCODES: Record<string, string> = {
  nederland: "NL",
  belgië: "BE",
  belgie: "BE",
  duitsland: "DE",
  frankrijk: "FR",
  luxemburg: "LU",
  zwitserland: "CH",
  oostenrijk: "AT",
  italië: "IT",
  italie: "IT",
  spanje: "ES",
  denemarken: "DK",
  tsjechië: "CZ",
  tsjechie: "CZ",
  slovenië: "SI",
  slovenie: "SI",
  kroatië: "HR",
  kroatie: "HR",
};

function landnaarCode(land: string): string | null {
  return LANDCODES[land.trim().toLowerCase()] ?? null;
}

// --- Adres-autocomplete -----------------------------------------------------

interface PhotonEigenschappen {
  name?: string;
  housenumber?: string;
  street?: string;
  postcode?: string;
  city?: string;
  country?: string;
}

interface PhotonAntwoord {
  features?: { properties: PhotonEigenschappen; geometry: { coordinates: [number, number] } }[];
}

/**
 * Adressen met autocomplete, op naam, straat of plek (zoals een camping) —
 * niet alleen op stad, zoals de geocoding hierboven. Een suggestie komt altijd
 * met coördinaten mee: kiest de gebruiker een suggestie, dan is het adres
 * daarmee bevestigd. Typt hij verder zonder te kiezen, dan blijft het
 * onbevestigd — dat onderscheid bewaakt de app zelf, niet deze functie.
 *
 * Geen resultaten of een onbereikbare dienst geven allebei een lege lijst: een
 * haperende autocomplete mag het typen niet in de weg zitten.
 */
export async function zoekAdressen(zoekterm: string): Promise<AdresSuggestie[]> {
  const trimmed = zoekterm.trim();
  if (trimmed.length < 3) return [];

  const url = new URL(config.extern.addressAutocompleteUrl);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("limit", "8");

  // Geen zoekterm loggen: die kan een thuisadres zijn.
  const antwoord = await haalJson<PhotonAntwoord>(url.toString(), "adressen");
  if (!antwoord.ok) return [];

  return (antwoord.data.features ?? []).map((feature) => bouwSuggestie(feature.properties, feature.geometry.coordinates));
}

function bouwSuggestie(
  eigenschappen: PhotonEigenschappen,
  coordinaten: [number, number],
): AdresSuggestie {
  const straatDeel = [eigenschappen.street, eigenschappen.housenumber].filter(Boolean).join(" ");
  // Bij een plek (camping, hotel) staat het adres los van de naam; bij een kaal
  // huisadres is er geen naam en volstaat de straat.
  const naamDeel =
    eigenschappen.name !== undefined && eigenschappen.name !== eigenschappen.city
      ? eigenschappen.name
      : undefined;
  const kern = [naamDeel, straatDeel || undefined].filter(Boolean).join(", ");

  const postcode = eigenschappen.postcode?.split(";")[0]?.trim() ?? undefined;
  const plaatsDeel = [postcode, eigenschappen.city].filter(Boolean).join(" ");

  const delen = [kern, plaatsDeel, eigenschappen.country].filter(
    (deel): deel is string => deel !== undefined && deel !== "",
  );
  // Achter elkaar dubbele delen (stad die ook als naam terugkomt) wegwerken.
  const uniek = delen.filter((deel, index) => index === 0 || deel !== delen[index - 1]);

  return {
    label: uniek.length > 0 ? uniek.join(", ") : "Onbekend adres",
    straat: eigenschappen.street ?? null,
    huisnummer: eigenschappen.housenumber ?? null,
    postcode: postcode ?? null,
    plaats: eigenschappen.city ?? null,
    land: eigenschappen.country ?? null,
    lat: coordinaten[1],
    lon: coordinaten[0],
  };
}

// --- Weer ------------------------------------------------------------------

interface WeerAntwoord {
  daily?: {
    time: string[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    wind_speed_10m_max: (number | null)[];
    precipitation_probability_max: (number | null)[];
  };
}

/** Open-Meteo geeft maximaal zestien dagen vooruit. */
const FORECAST_DAGEN_MAX = 16;

/**
 * Weersverwachting voor de dagen van het verblijf, voor zover die binnen de
 * verwachting vallen. Ligt de reis verder weg dan zestien dagen, dan komt de
 * verwachting voor de komende week terug met dektVerblijf op false — dan weet
 * het scherm dat het "nu ter plaatse" is en niet "tijdens het verblijf".
 */
export async function haalWeer(
  plaats: string,
  coordinaat: Coordinaat,
  van: string,
  tot: string,
): Promise<WeerReeks | null> {
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  const laatsteDag = new Date(vandaag);
  laatsteDag.setDate(laatsteDag.getDate() + FORECAST_DAGEN_MAX - 1);

  const vanafDatum = maxDatum(van, isoDatum(vandaag));
  const totDatum = minDatum(tot, isoDatum(laatsteDag));
  const dektVerblijf = vanafDatum <= totDatum;

  // Geen overlap: dan toch iets tonen, namelijk de komende week.
  const startDatum = dektVerblijf ? vanafDatum : isoDatum(vandaag);
  const eindDatum = dektVerblijf
    ? totDatum
    : isoDatum(new Date(vandaag.getTime() + 6 * 86_400_000));

  const sleutel = `weer:${coordinaat.lat.toFixed(3)},${coordinaat.lon.toFixed(3)}|${startDatum}|${eindDatum}`;
  const bewaard = uitCache<WeerReeks>(sleutel);
  if (bewaard !== undefined) return { ...bewaard, plaats };

  const url = new URL(config.extern.weatherUrl);
  url.searchParams.set("latitude", coordinaat.lat.toFixed(4));
  url.searchParams.set("longitude", coordinaat.lon.toFixed(4));
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_probability_max",
  );
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("start_date", startDatum);
  url.searchParams.set("end_date", eindDatum);

  const antwoord = await haalJson<WeerAntwoord>(url.toString(), "weer");
  if (!antwoord.ok) return null;
  const dagelijks = antwoord.data.daily;
  if (dagelijks === undefined || dagelijks.time.length === 0) return null;

  const dagen: WeerDag[] = dagelijks.time.map((datum, index) => ({
    datum,
    maxTemp: dagelijks.temperature_2m_max[index] ?? null,
    minTemp: dagelijks.temperature_2m_min[index] ?? null,
    windKmh: dagelijks.wind_speed_10m_max[index] ?? null,
    regenkans: dagelijks.precipitation_probability_max[index] ?? null,
  }));

  const reeks: WeerReeks = { plaats, dagen, dektVerblijf };
  inCache(sleutel, reeks);
  return reeks;
}

// --- Route -----------------------------------------------------------------

interface OsrmAntwoord {
  code?: string;
  routes?: {
    legs: { distance: number; duration: number }[];
    geometry?: { coordinates: [number, number][] };
  }[];
}

/**
 * Rijafstand en rijtijd langs de punten, in volgorde. Elk deel tussen twee
 * punten wordt een etappe: thuis → overnachting → ... → eindbestemming.
 */
export async function haalRoute(
  punten: { naam: string; coordinaat: Coordinaat }[],
): Promise<RouteInfo | null> {
  if (punten.length < 2) return null;

  const coordinaten = punten
    .map((punt) => `${punt.coordinaat.lon.toFixed(5)},${punt.coordinaat.lat.toFixed(5)}`)
    .join(";");

  const sleutel = `route:${coordinaten}`;
  const bewaard = uitCache<RouteInfo>(sleutel);
  if (bewaard !== undefined) return hernoem(bewaard, punten);

  // overview=simplified geeft de weg zelf mee (nodig om de route als lijn op
  // de kaart te tekenen) maar dan vereenvoudigd voor weergave op klein
  // formaat — "full" geeft elk bochtpunt en levert duizenden punten op voor
  // wat maar een paar honderd pixels breed getoond wordt.
  const url = `${config.extern.routingUrl.replace(/\/$/, "")}/route/v1/driving/${coordinaten}?overview=simplified&geometries=geojson`;
  const antwoord = await haalJson<OsrmAntwoord>(url, "route");
  if (!antwoord.ok) return null;
  const route = antwoord.data.routes?.[0];
  const legs = route?.legs;
  if (antwoord.data.code !== "Ok" || legs === undefined || legs.length !== punten.length - 1) {
    return null;
  }

  const etappes: RouteEtappe[] = legs.map((leg, index) => ({
    vanaf: punten[index]!.naam,
    naar: punten[index + 1]!.naam,
    afstandKm: Math.round(leg.distance / 1000),
    rijtijdMin: Math.round(leg.duration / 60),
  }));

  // OSRM geeft [lon, lat]; Leaflet wil [lat, lon].
  const geometrie: [number, number][] = (route?.geometry?.coordinates ?? []).map(
    ([lon, lat]) => [lat, lon],
  );

  const info: RouteInfo = {
    etappes,
    totaalAfstandKm: etappes.reduce((som, etappe) => som + etappe.afstandKm, 0),
    totaalRijtijdMin: etappes.reduce((som, etappe) => som + etappe.rijtijdMin, 0),
    geometrie,
  };
  inCache(sleutel, info);
  return info;
}

/** De cache is op coördinaten; de namen kunnen ondertussen gewijzigd zijn. */
function hernoem(info: RouteInfo, punten: { naam: string }[]): RouteInfo {
  return {
    ...info,
    etappes: info.etappes.map((etappe, index) => ({
      ...etappe,
      vanaf: punten[index]?.naam ?? etappe.vanaf,
      naar: punten[index + 1]?.naam ?? etappe.naar,
    })),
  };
}

// --- Bezienswaardigheden -----------------------------------------------------

export interface Bezienswaardigheid {
  naam: string;
  categorie: string;
  afstandKm: number;
  openingstijden: string | null;
  lat: number;
  lon: number;
}

interface OverpassElement {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassAntwoord {
  elements?: OverpassElement[];
}

/** Elke categorie: het OSM-tag/waarde-paar en hoe de app het noemt. */
const POI_CATEGORIEEN: { tag: string; waarde: string; categorie: string }[] = [
  { tag: "tourism", waarde: "attraction", categorie: "Attractie" },
  { tag: "tourism", waarde: "museum", categorie: "Museum" },
  { tag: "tourism", waarde: "viewpoint", categorie: "Uitkijkpunt" },
  { tag: "natural", waarde: "beach", categorie: "Strand" },
  { tag: "leisure", waarde: "nature_reserve", categorie: "Natuurgebied" },
  { tag: "amenity", waarde: "restaurant", categorie: "Restaurant" },
];

/** Straal om de bestemming waarbinnen gezocht wordt — "in de buurt", niet de hele regio. */
const POI_STRAAL_METER = 5000;
/**
 * Hoogstens dit aantal per categorie. Overpass geeft resultaten terug op
 * element-id, niet op volgorde van de query — één `out` aan het eind laat
 * restaurants (verreweg de talrijkste) dus alle andere categorieën
 * wegdrukken. Een eigen `out` per categorie voorkomt dat.
 */
const POI_PER_CATEGORIE = 6;
/** In totaal hoogstens dit aantal, over alle categorieën heen. */
const POI_TOTAAL_MAX = 30;

/**
 * Eén Overpass-query, met een los blok en een eigen `out` per categorie.
 * Duurder dan één around-filter voor alles, maar bij vijf kilometer straal
 * ruim binnen de marge — en het enige dat garandeert dat musea en
 * uitkijkpunten niet verdrinken in restaurants.
 */
function overpassQuery(coordinaat: Coordinaat): string {
  const rond = `around:${POI_STRAAL_METER},${coordinaat.lat},${coordinaat.lon}`;
  const blokken = POI_CATEGORIEEN.map(
    ({ tag, waarde }) =>
      `(node["${tag}"="${waarde}"](${rond});way["${tag}"="${waarde}"](${rond}););out center tags ${POI_PER_CATEGORIE};`,
  ).join("\n");
  return `[out:json][timeout:${Math.round(config.extern.overpassTimeoutMs / 1000)}];\n${blokken}`;
}

/**
 * Bezienswaardigheden rond een plek: attracties, musea, natuurgebieden,
 * stranden, restaurants en uitkijkpunten, via OpenStreetMap (Overpass) — ook
 * dit zonder sleutel. Een element zonder naam slaan we over: "Onbekend" is
 * niets om aan te bevelen. Een beoordeling levert deze bron niet op, dus die
 * verzinnen we niet bij — afstand en openingstijden (waar bekend) wel.
 */
export async function haalBezienswaardigheden(
  coordinaat: Coordinaat,
): Promise<Bezienswaardigheid[] | null> {
  if (!config.extern.enabled) return null;

  const sleutel = `poi:${coordinaat.lat.toFixed(3)},${coordinaat.lon.toFixed(3)}`;
  const bewaard = uitCache<Bezienswaardigheid[]>(sleutel);
  if (bewaard !== undefined) return bewaard;

  const afbreken = AbortSignal.timeout(config.extern.overpassTimeoutMs);
  let data: OverpassAntwoord;
  try {
    const response = await fetch(config.extern.overpassUrl, {
      method: "POST",
      signal: afbreken,
      headers: {
        "User-Agent": config.extern.userAgent,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data=${encodeURIComponent(overpassQuery(coordinaat))}`,
    });
    if (!response.ok) {
      externeFout("bezienswaardigheden", `status ${response.status}`);
      return null;
    }
    data = (await response.json()) as OverpassAntwoord;
  } catch (error) {
    externeFout("bezienswaardigheden", foutReden(error));
    return null;
  }

  const resultaten: Bezienswaardigheid[] = [];
  for (const element of data.elements ?? []) {
    const naam = element.tags?.["name"];
    if (naam === undefined || naam.trim() === "") continue;
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (lat === undefined || lon === undefined) continue;

    const categorie = POI_CATEGORIEEN.find(
      ({ tag, waarde }) => element.tags?.[tag] === waarde,
    )?.categorie;
    if (categorie === undefined) continue;

    resultaten.push({
      naam,
      categorie,
      afstandKm: afstandTussen(coordinaat, { lat, lon }),
      openingstijden: element.tags?.["opening_hours"] ?? null,
      lat,
      lon,
    });
  }

  // Dichtstbijzijnde eerst; niet oneindig veel, anders wordt het een muur van
  // stipjes in plaats van een lijstje om uit te kiezen.
  resultaten.sort((a, b) => a.afstandKm - b.afstandKm);
  const beperkt = resultaten.slice(0, POI_TOTAAL_MAX);

  inCache(sleutel, beperkt);
  return beperkt;
}

/** Hemelsbrede afstand in kilometers (Haversine), op één decimaal. */
function afstandTussen(a: Coordinaat, b: Coordinaat): number {
  const straalAarde = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * straalAarde * Math.asin(Math.sqrt(h)) * 10) / 10;
}

// --- Verkeersinformatie ------------------------------------------------------

export interface VerkeersIncident {
  categorie: string;
  ernst: string;
  omschrijving: string | null;
  vertragingMin: number | null;
  weg: string | null;
}

export interface Bbox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * Oppervlakte van een bounding box in km², met lengtegraad geschaald naar de
 * breedtegraad — anders is een graad lengte bij Chamonix (46° noord) een stuk
 * korter dan bij de evenaar, en klopt de schatting niet.
 */
function bboxOppervlakteKm2(bbox: Bbox): number {
  const KM_PER_GRAAD_BREEDTE = 111.32;
  const middenBreedteRad = ((bbox.minLat + bbox.maxLat) / 2) * (Math.PI / 180);
  const kmPerGraadLengte = KM_PER_GRAAD_BREEDTE * Math.cos(middenBreedteRad);
  const hoogteKm = (bbox.maxLat - bbox.minLat) * KM_PER_GRAAD_BREEDTE;
  const breedteKm = (bbox.maxLon - bbox.minLon) * kmPerGraadLengte;
  return hoogteKm * breedteKm;
}

/**
 * TomTom wijst een bbox groter dan 10.000 km² af — voor een reis van
 * Nederland naar de Franse Alpen is de kortste-afstand-bbox rond de 160.000
 * km². Een bbox rond de hele route werkt dus niet; in plaats daarvan volgt
 * deze functie de routegeometrie (die de weg volgt, niet de rechte lijn) en
 * knipt hem op in stukken die stuk voor stuk onder de grens blijven. Ruim
 * onder de 10.000 km² gehouden, zodat afronding niet alsnog over de grens
 * duwt.
 */
const MAX_CHUNK_OPPERVLAKTE_KM2 = 8000;
/** Bij een erg lange route niet oneindig veel aparte aanvragen doen. */
const MAX_CHUNKS = 12;

export function verkeerChunks(geometrie: [number, number][]): Bbox[] {
  if (geometrie.length === 0) return [];

  const chunks: Bbox[] = [];
  let huidige: Bbox = {
    minLat: geometrie[0]![0],
    maxLat: geometrie[0]![0],
    minLon: geometrie[0]![1],
    maxLon: geometrie[0]![1],
  };

  for (let i = 1; i < geometrie.length; i++) {
    const [lat, lon] = geometrie[i]!;
    const proef: Bbox = {
      minLat: Math.min(huidige.minLat, lat),
      maxLat: Math.max(huidige.maxLat, lat),
      minLon: Math.min(huidige.minLon, lon),
      maxLon: Math.max(huidige.maxLon, lon),
    };
    if (bboxOppervlakteKm2(proef) > MAX_CHUNK_OPPERVLAKTE_KM2) {
      chunks.push(huidige);
      // Het vorige punt telt dubbel mee, zodat er geen gat in de route valt
      // tussen het einde van dit stuk en het begin van het volgende.
      const [vorigeLat, vorigeLon] = geometrie[i - 1]!;
      huidige = {
        minLat: Math.min(vorigeLat, lat),
        maxLat: Math.max(vorigeLat, lat),
        minLon: Math.min(vorigeLon, lon),
        maxLon: Math.max(vorigeLon, lon),
      };
    } else {
      huidige = proef;
    }
  }
  chunks.push(huidige);

  if (chunks.length <= MAX_CHUNKS) return chunks;

  // Te veel stukken voor een erg lange route: gelijkmatig uitdunnen in
  // plaats van alleen het begin van de route te dekken.
  const stap = chunks.length / MAX_CHUNKS;
  return Array.from({ length: MAX_CHUNKS }, (_, i) => chunks[Math.floor(i * stap)]!);
}

interface TomTomIncidentAntwoord {
  incidents?: {
    properties?: {
      iconCategory?: number;
      magnitudeOfDelay?: number;
      delay?: number;
      events?: { description?: string }[];
      roadNumbers?: string[];
    };
  }[];
}

/** TomTom's iconCategory-codes, vertaald. Onbekende codes tonen als "Overig". */
const INCIDENT_CATEGORIE: Record<number, string> = {
  1: "Ongeluk",
  2: "Mist",
  3: "Gevaarlijke situatie",
  4: "Regen",
  5: "IJzel",
  6: "File",
  7: "Rijstrook afgesloten",
  8: "Weg afgesloten",
  9: "Wegwerkzaamheden",
  10: "Wind",
  11: "Overstroming",
  14: "Autopech",
};

/** TomTom's magnitudeOfDelay-codes: 0 tot 4, oplopend van geen tot zeer ernstig. */
const INCIDENT_ERNST: Record<number, string> = {
  0: "onbekend",
  1: "gering",
  2: "matig",
  3: "ernstig",
  4: "zeer ernstig",
};

/** Niet oneindig veel incidenten — de ergste vertragingen eerst. */
const VERKEER_MAX = 20;

/** Eén stuk van de route bevragen bij TomTom; null bij een mislukte aanvraag. */
async function haalVerkeerVoorBbox(bbox: Bbox): Promise<VerkeersIncident[] | null> {
  const sleutel = `verkeer:${bbox.minLat.toFixed(2)},${bbox.minLon.toFixed(2)},${bbox.maxLat.toFixed(2)},${bbox.maxLon.toFixed(2)}`;
  const bewaard = uitCache<VerkeersIncident[]>(sleutel);
  if (bewaard !== undefined) return bewaard;

  const url = new URL(config.traffic.tomtomUrl);
  url.searchParams.set("key", config.traffic.tomtomApiKey);
  url.searchParams.set("bbox", `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`);
  url.searchParams.set(
    "fields",
    "{incidents{properties{iconCategory,magnitudeOfDelay,delay,events{description},roadNumbers}}}",
  );
  url.searchParams.set("language", "nl-NL");
  url.searchParams.set("timeValidityFilter", "present");

  const antwoord = await haalJson<TomTomIncidentAntwoord>(url.toString(), "verkeer");
  if (!antwoord.ok) return null;

  const incidenten = (antwoord.data.incidents ?? [])
    .map((element): VerkeersIncident | null => {
      const eigenschappen = element.properties;
      if (eigenschappen === undefined) return null;
      return {
        categorie: INCIDENT_CATEGORIE[eigenschappen.iconCategory ?? -1] ?? "Overig",
        ernst: INCIDENT_ERNST[eigenschappen.magnitudeOfDelay ?? 0] ?? "onbekend",
        omschrijving: eigenschappen.events?.[0]?.description ?? null,
        vertragingMin:
          eigenschappen.delay !== undefined ? Math.round(eigenschappen.delay / 60) : null,
        weg: eigenschappen.roadNumbers?.[0] ?? null,
      };
    })
    .filter((incident): incident is VerkeersIncident => incident !== null);

  inCache(sleutel, incidenten);
  return incidenten;
}

/**
 * Actuele incidenten (files, ongelukken, wegwerkzaamheden) langs de route,
 * via TomTom. Anders dan weer, route en bezienswaardigheden werkt dit niet
 * zonder sleutel — is die niet gezet, dan geeft de functie null terug,
 * precies als bij een onbereikbare dienst.
 *
 * TomTom's bbox mag niet groter zijn dan 10.000 km², en een reis van
 * Nederland naar de Alpen is dat als geheel ruimschoots — zie
 * `verkeerChunks`. Elk stuk van de route wordt apart bevraagd en de
 * resultaten gaan samen, ontdubbeld op plek + omschrijving (een incident bij
 * de rand van twee stukken komt anders dubbel in de lijst).
 */
export async function haalVerkeer(
  geometrie: [number, number][],
): Promise<VerkeersIncident[] | null> {
  if (!config.extern.enabled) return null;
  if (config.traffic.tomtomApiKey === "") return null;

  const chunks = verkeerChunks(geometrie);
  if (chunks.length === 0) return [];

  const resultaten = await Promise.all(chunks.map((chunk) => haalVerkeerVoorBbox(chunk)));
  // Al mislukt een stuk van de route, dan is er nog altijd verkeersinfo voor
  // de rest — pas als ALLES mislukt is er echt niets te tonen.
  if (resultaten.every((resultaat) => resultaat === null)) return null;

  const gezien = new Set<string>();
  const incidenten: VerkeersIncident[] = [];
  for (const resultaat of resultaten) {
    for (const incident of resultaat ?? []) {
      const sleutel = `${incident.weg ?? ""}|${incident.omschrijving ?? incident.categorie}`;
      if (gezien.has(sleutel)) continue;
      gezien.add(sleutel);
      incidenten.push(incident);
    }
  }

  // De grootste vertraging eerst — dat is het meest relevant voor de reis.
  incidenten.sort((a, b) => (b.vertragingMin ?? 0) - (a.vertragingMin ?? 0));
  return incidenten.slice(0, VERKEER_MAX);
}

// --- Datumhulp -------------------------------------------------------------

function isoDatum(datum: Date): string {
  return `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, "0")}-${String(
    datum.getDate(),
  ).padStart(2, "0")}`;
}

function maxDatum(a: string, b: string): string {
  return a > b ? a : b;
}

function minDatum(a: string, b: string): string {
  return a < b ? a : b;
}
