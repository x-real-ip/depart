/**
 * Configuratie komt uitsluitend uit de omgeving. Niets is hardcoded, en de
 * DATABASE_URL wordt nergens gelogd — die bevat het wachtwoord.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Alleen de naam van de variabele, nooit de waarde.
    throw new Error(`Omgevingsvariabele ${name} is verplicht maar niet gezet`);
  }
  return value;
}

export const config = {
  databaseUrl: required("DATABASE_URL"),
  documentsPath: required("DOCUMENTS_PATH"),
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? "0.0.0.0",

  /** Optionele bearer-token, net als bij open-family-finance. Leeg = open API. */
  apiToken: process.env.API_TOKEN ?? "",

  logLevel: process.env.LOG_LEVEL ?? "info",

  /**
   * Externe diensten voor weer en route. Alle drie werken zonder sleutel.
   * Adressen zijn instelbaar, zodat je later een eigen instantie kunt gebruiken
   * (bijvoorbeeld een eigen OSRM) zonder de code aan te passen.
   *
   * Zet EXTERN_ENABLED op "false" om de app zonder internet te laten werken:
   * de weer- en route-endpoints geven dan netjes "niet beschikbaar" terug in
   * plaats van een fout.
   */
  extern: {
    enabled: (process.env.EXTERN_ENABLED ?? "true").toLowerCase() !== "false",
    geocodingUrl: process.env.GEOCODING_URL ?? "https://geocoding-api.open-meteo.com/v1/search",
    weatherUrl: process.env.WEATHER_URL ?? "https://api.open-meteo.com/v1/forecast",
    routingUrl: process.env.ROUTING_URL ?? "https://router.project-osrm.org",
    /**
     * Voor het adresveld met autocomplete: Photon, gebouwd op OpenStreetMap.
     * Anders dan de geocoding hierboven (die alleen plaatsnamen kent) vindt
     * deze ook straten, huisnummers en plekken zoals een camping.
     */
    addressAutocompleteUrl: process.env.ADDRESS_AUTOCOMPLETE_URL ?? "https://photon.komoot.io/api/",
    /**
     * Voor bezienswaardigheden in de buurt van de bestemming: Overpass, op
     * OpenStreetMap-gegevens — ook zonder sleutel.
     */
    overpassUrl: process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter",
    /**
     * Zes categorieën in één query duurt in een drukke stad al gauw acht
     * seconden — de gewone timeout hierboven is daarvoor te krap.
     */
    overpassTimeoutMs: Number(process.env.OVERPASS_TIMEOUT_MS ?? 20_000),
    /** Hoe lang een antwoord in het geheugen blijft staan. */
    cacheMinuten: Number(process.env.EXTERN_CACHE_MINUTES ?? 30),
    timeoutMs: Number(process.env.EXTERN_TIMEOUT_MS ?? 8000),
    /** Nette identificatie richting de publieke diensten. */
    userAgent: process.env.EXTERN_USER_AGENT ?? "depart/1.0 (self-hosted)",
  },

  /**
   * Actuele verkeersinformatie (files, ongelukken, wegwerkzaamheden) en de
   * tolkosten-schatting zijn, anders dan weer, route en bezienswaardigheden,
   * niet als publieke dienst zonder sleutel te krijgen — dat blijven, voor de
   * hele reis en niet alleen Nederland, alleen commerciële partijen. Zonder
   * sleutel tonen die schermdelen netjes "niet beschikbaar" in plaats van dat
   * de functie ontbreekt. Beide diensten delen dezelfde TomTom-sleutel.
   */
  tomtom: {
    apiKey: process.env.TOMTOM_API_KEY ?? "",
    incidentsUrl:
      process.env.TOMTOM_INCIDENTS_URL ?? "https://api.tomtom.com/traffic/services/5/incidentDetails",
    /** Voor de tolkosten-schatting: welke stukken van de route tolwegen zijn. */
    routingUrl:
      process.env.TOMTOM_ROUTING_URL ?? "https://api.tomtom.com/routing/1/calculateRoute",
  },
} as const;

/** Toegestane bestandstypen voor documenten, gecontroleerd op de inhoud. */
export const ALLOWED_MIMETYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
] as const;

/** Maximale grootte per bestand: 20 MB. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
