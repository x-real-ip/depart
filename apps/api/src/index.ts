import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { MAX_UPLOAD_BYTES, config } from "./config.js";
import { pool, waitForDatabase } from "./db.js";
import { adresRoutes } from "./routes/adressen.js";
import { documentRoutes } from "./routes/documents.js";
import { packItemRoutes } from "./routes/packItems.js";
import { reisinfoRoutes } from "./routes/reisinfo.js";
import { onderwegRoutes } from "./routes/stops.js";
import { tripRoutes } from "./routes/trips.js";
import { initDocumentsPath } from "./storage.js";
import { NotFoundError, ValidationError } from "./validate.js";

const app = Fastify({
  logger: {
    level: config.logLevel,
    // Standaard logt Fastify de volledige URL. Die bevat alleen ids, geen
    // bestandsnamen. Bestandsnamen, documentinhoud en de DATABASE_URL worden
    // nergens gelogd.
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie"],
      censor: "[weggelaten]",
    },
    // De querystring hoort niet in het logbestand: /api/adressen?q=... kan een
    // thuisadres bevatten. Alleen het pad wordt gelogd, nooit de parameters.
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: request.url.split("?")[0],
          hostname: request.hostname,
        };
      },
    },
  },
  bodyLimit: 1024 * 1024,
  trustProxy: true,
});

await app.register(multipart, {
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
    // Uploads gaan altijd naar één document; er zijn geen extra velden nodig.
    fields: 4,
  },
});

/**
 * Health-endpoint dat ook de databaseverbinding controleert. Buiten /api,
 * zodat de probes van Kubernetes geen token hoeven mee te sturen.
 */
app.get("/healthz", async (_request, reply) => {
  try {
    await pool.query("SELECT 1");
    return { status: "ok", database: "ok" };
  } catch {
    // Geen foutdetail naar buiten: dat kan de verbindingsgegevens bevatten.
    reply.code(503);
    return { status: "fout", database: "onbereikbaar" };
  }
});

/**
 * Optionele bearer-token op alles onder /api, hetzelfde patroon als
 * open-family-finance. De echte afscherming zit in het netwerk (de app hangt
 * achter de private gateway); dit is een tweede slot.
 */
app.addHook("onRequest", async (request, reply) => {
  if (!config.apiToken) return;
  if (!request.url.startsWith("/api/")) return;
  if (request.headers.authorization === `Bearer ${config.apiToken}`) return;
  reply.code(401);
  return reply.send({ error: "Geen toegang" });
});

// De fout- en niet-gevonden-handlers moeten vóór het registreren van de routes
// worden gezet. Een child-context van register neemt de handlers over die op dat
// moment gelden; zet je ze erna, dan gebruikt /api nog de standaardhandler van
// Fastify en komt de Nederlandse melding nooit bij de app aan.
app.setNotFoundHandler(async (_request, reply) => {
  reply.code(404);
  return { error: "Dit adres bestaat niet" };
});

app.setErrorHandler(async (error, request, reply) => {
  if (error instanceof ValidationError || error instanceof NotFoundError) {
    reply.code(error.statusCode);
    return { error: error.message };
  }

  // Grens van @fastify/multipart.
  if ((error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
    reply.code(413);
    return { error: "Dit bestand is groter dan 20 MB" };
  }

  // Schendingen van de CHECK- en foreign-key-regels uit de migratie.
  const pgCode = (error as { code?: string }).code;
  if (pgCode === "23514" || pgCode === "23503" || pgCode === "22P02") {
    request.log.warn({ pgCode }, "Aanvraag paste niet bij de gegevens");
    reply.code(400);
    return { error: "Deze gegevens passen niet bij elkaar" };
  }

  request.log.error({ err: error }, "Onverwachte fout");
  // Fastify's eigen fouten (bijvoorbeeld een onleesbare JSON-body) dragen een
  // eigen statuscode; al het andere is een 500.
  const status = (error as { statusCode?: number }).statusCode;
  reply.code(status && status < 500 ? status : 500);
  return { error: "Er ging iets mis" };
});

await app.register(
  async (api) => {
    await api.register(tripRoutes);
    await api.register(packItemRoutes);
    await api.register(onderwegRoutes);
    await api.register(documentRoutes);
    await api.register(reisinfoRoutes);
    await api.register(adresRoutes);
  },
  { prefix: "/api" },
);

async function start(): Promise<void> {
  await initDocumentsPath();
  // De api kan eerder starten dan postgres; wachten is beter dan crashloopen.
  await waitForDatabase();
  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    { poort: config.port, documenten: config.documentsPath },
    "Depart-api gestart",
  );
}

for (const signaal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signaal, () => {
    app.log.info({ signaal }, "Afsluiten");
    void app
      .close()
      .then(() => pool.end())
      .then(() => process.exit(0));
  });
}

try {
  await start();
} catch (error) {
  app.log.error({ err: error }, "Starten mislukt");
  process.exit(1);
}
