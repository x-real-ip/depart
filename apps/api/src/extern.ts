import { config } from "./config.js";

/**
 * Weer, route en het opzoeken van coördinaten. Alle drie via publieke diensten
 * die zonder sleutel werken:
 *
 * - Open-Meteo geocoding  — plaatsnaam naar coördinaten
 * - Open-Meteo forecast   — dag- en nachttemperatuur, wind, regenkans
 * - OSRM                  — afstand en rijtijd per etappe
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
 * Haalt JSON op met een timeout. Geeft null bij elke fout: een dienst die er
 * niet is, mag geen 500 opleveren.
 */
async function haalJson<T>(url: string, waarvoor: string): Promise<T | null> {
  if (!config.extern.enabled) return null;

  const afbreken = AbortSignal.timeout(config.extern.timeoutMs);
  try {
    const response = await fetch(url, {
      signal: afbreken,
      headers: { "User-Agent": config.extern.userAgent, Accept: "application/json" },
    });
    if (!response.ok) {
      externeFout(waarvoor, `status ${response.status}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    externeFout(waarvoor, foutReden(error));
    return null;
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
): Promise<Coordinaat | null> {
  const sleutel = `geo:${plaats.toLowerCase()}|${(land ?? "").toLowerCase()}`;
  const bewaard = uitCache<Coordinaat | null>(sleutel);
  if (bewaard !== undefined) return bewaard;

  const url = new URL(config.extern.geocodingUrl);
  url.searchParams.set("name", plaats);
  url.searchParams.set("count", "10");
  url.searchParams.set("language", "nl");
  url.searchParams.set("format", "json");

  const antwoord = await haalJson<GeocodingAntwoord>(url.toString(), "geocoding");
  const treffers = antwoord?.results ?? [];
  if (treffers.length === 0) return null;

  // Bij een land: de eerste treffer in dat land. Anders de eerste treffer.
  const landcode = land === null || land === undefined ? null : landnaarCode(land);
  const treffer =
    (landcode !== null
      ? treffers.find((r) => r.country_code?.toUpperCase() === landcode)
      : undefined) ?? treffers[0]!;

  const resultaat: Coordinaat = { lat: treffer.latitude, lon: treffer.longitude };
  inCache(sleutel, resultaat);
  return resultaat;
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
  const dagelijks = antwoord?.daily;
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
  routes?: { legs: { distance: number; duration: number }[] }[];
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

  const url = `${config.extern.routingUrl.replace(/\/$/, "")}/route/v1/driving/${coordinaten}?overview=false`;
  const antwoord = await haalJson<OsrmAntwoord>(url, "route");
  const legs = antwoord?.routes?.[0]?.legs;
  if (antwoord?.code !== "Ok" || legs === undefined || legs.length !== punten.length - 1) {
    return null;
  }

  const etappes: RouteEtappe[] = legs.map((leg, index) => ({
    vanaf: punten[index]!.naam,
    naar: punten[index + 1]!.naam,
    afstandKm: Math.round(leg.distance / 1000),
    rijtijdMin: Math.round(leg.duration / 60),
  }));

  const info: RouteInfo = {
    etappes,
    totaalAfstandKm: etappes.reduce((som, etappe) => som + etappe.afstandKm, 0),
    totaalRijtijdMin: etappes.reduce((som, etappe) => som + etappe.rijtijdMin, 0),
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
