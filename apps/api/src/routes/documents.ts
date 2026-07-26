import type { FastifyPluginAsync } from "fastify";
import { DOCUMENTTYPES, STANDAARD_DOCUMENTTYPES } from "../defaults.js";
import { query, queryOne, transaction } from "../db.js";
import {
  EXTENSIE_PER_MIMETYPE,
  bepaalMimetype,
  bewaarBestand,
  leesBestand,
  verwijderBestand,
} from "../storage.js";
import { toDocument, type DocumentRow, type TripRow } from "../types.js";
import { Fields, NotFoundError, ValidationError, pathUuid } from "../validate.js";
import { haalTrip } from "./trips.js";

const DOCUMENT_VELDEN = [
  "id",
  "trip_id",
  "traveler_id",
  "type",
  "omschrijving",
  "geldig_tot",
  "bestandspad",
  "bestandsnaam",
  "mimetype",
  "grootte",
] as const;

const DOCUMENT_KOLOMMEN = DOCUMENT_VELDEN.join(", ");

// Bij een join met trip is een kale kolomnaam als `id` dubbelzinnig, dus daar
// gaat de tabelnaam ervoor.
const DOCUMENT_KOLOMMEN_MET_TABEL = DOCUMENT_VELDEN.map((veld) => `document.${veld}`).join(", ");

/** Haalt een document op, met de terugdatum van de reis erbij voor de status. */
async function haalDocument(id: string): Promise<{ document: DocumentRow; terugdatum: string }> {
  const row = await queryOne<DocumentRow & { terugdatum: string }>(
    `SELECT ${DOCUMENT_KOLOMMEN_MET_TABEL}, trip.terugdatum
     FROM document JOIN trip ON trip.id = document.trip_id
     WHERE document.id = $1`,
    [id],
  );
  if (!row) throw new NotFoundError("Dit document bestaat niet");
  const { terugdatum, ...document } = row;
  return { document, terugdatum };
}

export const documentRoutes: FastifyPluginAsync = async (app) => {
  /** Types die het formulier als keuze aanbiedt. */
  app.get("/documenttypes", async () => DOCUMENTTYPES);

  app.get("/trips/:tripId/documents", async (request) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    const trip = await haalTrip(tripId);
    const result = await query<DocumentRow>(
      `SELECT ${DOCUMENT_KOLOMMEN} FROM document WHERE trip_id = $1
       ORDER BY traveler_id NULLS FIRST, type ASC, created_at ASC`,
      [tripId],
    );
    return result.rows.map((row) => toDocument(row, trip.terugdatum));
  });

  app.post("/trips/:tripId/documents", async (request, reply) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    const trip = await haalTrip(tripId);
    const fields = new Fields(request.body);

    const travelerId = fields.optionalUuid("travelerId");
    if (travelerId) await controleerReiziger(travelerId, tripId);

    const row = await queryOne<DocumentRow>(
      `INSERT INTO document (trip_id, traveler_id, type, omschrijving, geldig_tot)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${DOCUMENT_KOLOMMEN}`,
      [
        tripId,
        travelerId,
        fields.text("type", { max: 80 }),
        fields.optionalText("omschrijving", { max: 300 }),
        fields.optionalDate("geldigTot"),
      ],
    );
    reply.code(201);
    return toDocument(row!, trip.terugdatum);
  });

  /**
   * Zet de standaardtypes klaar voor een nieuwe reis: een paspoort of ID per
   * reiziger, en de gezins- en autodocumenten één keer. Types die er al staan
   * worden overgeslagen.
   */
  app.post("/trips/:tripId/documents/standaardtypes", async (request) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    const trip = await haalTrip(tripId);

    const reizigers = await query<{ id: string }>(
      `SELECT id FROM traveler WHERE trip_id = $1 ORDER BY created_at ASC`,
      [tripId],
    );

    const nieuw = await transaction(async (client) => {
      const bestaand = await client.query<{ type: string; traveler_id: string | null }>(
        `SELECT type, traveler_id FROM document WHERE trip_id = $1`,
        [tripId],
      );
      const aanwezig = new Set(
        bestaand.rows.map((row) => `${row.type.toLowerCase()}|${row.traveler_id ?? ""}`),
      );

      const toegevoegd: DocumentRow[] = [];
      for (const entry of STANDAARD_DOCUMENTTYPES) {
        const doelen = entry.perPersoon ? reizigers.rows.map((row) => row.id) : [null];
        for (const travelerId of doelen) {
          if (aanwezig.has(`${entry.type.toLowerCase()}|${travelerId ?? ""}`)) continue;
          const created = await client.query<DocumentRow>(
            `INSERT INTO document (trip_id, traveler_id, type) VALUES ($1, $2, $3)
             RETURNING ${DOCUMENT_KOLOMMEN}`,
            [tripId, travelerId, entry.type],
          );
          toegevoegd.push(created.rows[0]!);
        }
      }
      return toegevoegd;
    });

    return {
      toegevoegd: nieuw.length,
      documenten: nieuw.map((row) => toDocument(row, trip.terugdatum)),
    };
  });

  app.patch("/documents/:id", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const { document, terugdatum } = await haalDocument(id);
    const fields = new Fields(request.body);

    const type = fields.has("type") ? fields.text("type", { max: 80 }) : document.type;
    const omschrijving = fields.has("omschrijving")
      ? fields.optionalText("omschrijving", { max: 300 })
      : document.omschrijving;
    const geldigTot = fields.has("geldigTot")
      ? fields.optionalDate("geldigTot")
      : document.geldig_tot;

    let travelerId = document.traveler_id;
    if (fields.has("travelerId")) {
      travelerId = fields.optionalUuid("travelerId");
      if (travelerId) await controleerReiziger(travelerId, document.trip_id);
    }

    const row = await queryOne<DocumentRow>(
      `UPDATE document SET type = $2, omschrijving = $3, geldig_tot = $4, traveler_id = $5
       WHERE id = $1 RETURNING ${DOCUMENT_KOLOMMEN}`,
      [id, type, omschrijving, geldigTot, travelerId],
    );
    return toDocument(row!, terugdatum);
  });

  /**
   * Uploadt het bestand bij een document. Het type wordt op de inhoud
   * gecontroleerd (magic bytes), niet op de extensie of de meegestuurde
   * content-type. Maximaal 20 MB, afgedwongen door @fastify/multipart.
   */
  app.post("/documents/:id/bestand", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const { document, terugdatum } = await haalDocument(id);

    const deel = await request.file();
    if (!deel) throw new ValidationError("Er is geen bestand meegestuurd");

    let buffer: Buffer;
    try {
      buffer = await deel.toBuffer();
    } catch {
      // @fastify/multipart gooit zodra de limiet overschreden wordt.
      reply.code(413);
      return { error: "Dit bestand is groter dan 20 MB" };
    }
    if (deel.file.truncated) {
      reply.code(413);
      return { error: "Dit bestand is groter dan 20 MB" };
    }
    if (buffer.byteLength === 0) throw new ValidationError("Het bestand is leeg");

    const mimetype = await bepaalMimetype(buffer);
    const bewaard = await bewaarBestand(document.trip_id, id, buffer, mimetype);

    // Een eerder bestand met een andere extensie zou blijven staan.
    const oudPad = document.bestandspad;
    if (oudPad && oudPad !== bewaard.bestandspad) {
      await verwijderBestand(oudPad);
    }

    const bestandsnaam = veiligeBestandsnaam(deel.filename, mimetype);
    const row = await queryOne<DocumentRow>(
      `UPDATE document SET bestandspad = $2, bestandsnaam = $3, mimetype = $4, grootte = $5
       WHERE id = $1 RETURNING ${DOCUMENT_KOLOMMEN}`,
      [id, bewaard.bestandspad, bestandsnaam, bewaard.mimetype, bewaard.grootte],
    );
    return toDocument(row!, terugdatum);
  });

  /**
   * Levert het bestand uit. Altijd via de api en op het document-id, nooit als
   * statisch bestand op een raadbare URL.
   */
  app.get("/documents/:id/bestand", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const { document } = await haalDocument(id);
    if (!document.bestandspad || !document.bestandsnaam || !document.mimetype) {
      throw new NotFoundError("Bij dit document is nog geen bestand geüpload");
    }

    reply
      .type(document.mimetype)
      .header(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(document.bestandsnaam)}`,
      )
      .header("Content-Length", String(document.grootte ?? 0))
      .header("Cache-Control", "private, no-store")
      .header("X-Content-Type-Options", "nosniff")
      // Een geüpload bestand mag niets kunnen opvragen of uitvoeren.
      .header("Content-Security-Policy", "default-src 'none'; sandbox");

    return reply.send(leesBestand(document.bestandspad));
  });

  /** Haalt alleen het bestand weg; het document blijft staan als "ontbreekt". */
  app.delete("/documents/:id/bestand", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const { document, terugdatum } = await haalDocument(id);
    if (!document.bestandspad) throw new NotFoundError("Bij dit document staat geen bestand");

    const row = await queryOne<DocumentRow>(
      `UPDATE document SET bestandspad = NULL, bestandsnaam = NULL, mimetype = NULL, grootte = NULL
       WHERE id = $1 RETURNING ${DOCUMENT_KOLOMMEN}`,
      [id],
    );
    await verwijderBestand(document.bestandspad);
    return toDocument(row!, terugdatum);
  });

  /** Verwijdert het document en het bestand op schijf. */
  app.delete("/documents/:id", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const { document } = await haalDocument(id);
    await query(`DELETE FROM document WHERE id = $1`, [id]);
    if (document.bestandspad) await verwijderBestand(document.bestandspad);
    reply.code(204);
    return null;
  });
};

async function controleerReiziger(travelerId: string, tripId: string): Promise<void> {
  const reiziger = await queryOne<{ id: string }>(
    `SELECT id FROM traveler WHERE id = $1 AND trip_id = $2`,
    [travelerId, tripId],
  );
  if (!reiziger) throw new ValidationError("Deze reiziger hoort niet bij deze reis");
}

/**
 * De naam die de gebruiker zag, maar zonder padtekens en zonder een extensie
 * die niet bij de werkelijke inhoud past. Deze naam is alleen een label: het
 * bestand op schijf heet altijd <documentId>.<ext>.
 */
function veiligeBestandsnaam(origineel: string | undefined, mimetype: string): string {
  const extensie = EXTENSIE_PER_MIMETYPE[mimetype] ?? "bin";
  const basis = (origineel ?? "")
    .replace(/[\\/]/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\.[^.]*$/, "")
    .trim()
    .slice(0, 120);
  return `${basis === "" ? "document" : basis}.${extensie}`;
}
