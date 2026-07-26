import type { FastifyPluginAsync } from "fastify";
import { zoekAdressen } from "../extern.js";

/**
 * Adres-autocomplete voor het thuisadres, de bestemming en overnachtingen
 * onderweg. Een lege lijst bij te weinig tekens of een onbereikbare dienst —
 * nooit een fout, want dat zou het typen onderbreken.
 *
 * De zoekterm wordt nergens gelogd (zie de custom request-serializer in
 * index.ts, die query-strings uit de logregel haalt): een thuisadres is
 * precies het soort gegeven dat hier niet in een logbestand moet belanden.
 */
export const adresRoutes: FastifyPluginAsync = async (app) => {
  app.get("/adressen", async (request) => {
    const { q } = request.query as { q?: string };
    return zoekAdressen(q ?? "");
  });
};
