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
