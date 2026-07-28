import type { FastifyPluginAsync } from "fastify";
import { STANDAARD_PERSOONLIJK, STANDAARD_UITRUSTING } from "../defaults.js";
import { query, queryOne, transaction } from "../db.js";
import { toPackItem, toPackList, type PackItemRow, type PackListRow } from "../types.js";
import { Fields, NotFoundError, ValidationError, pathUuid } from "../validate.js";
import { haalTrip } from "./trips.js";

const PACK_LIST_KOLOMMEN = `id, trip_id, naam, traveler_id`;
const PACK_ITEM_KOLOMMEN = `id, trip_id, pack_list_id, label, afgevinkt, volgorde`;

async function haalPackList(id: string): Promise<PackListRow> {
  const row = await queryOne<PackListRow>(
    `SELECT ${PACK_LIST_KOLOMMEN} FROM pack_list WHERE id = $1`,
    [id],
  );
  if (!row) throw new NotFoundError("Deze inpaklijst bestaat niet");
  return row;
}

/** Eerstvolgende vrije volgorde op een lijst — nieuwe items komen achteraan. */
async function volgendeVolgorde(packListId: string): Promise<number> {
  const rij = await queryOne<{ volgende: number }>(
    `SELECT COALESCE(max(volgorde) + 1, 0) AS volgende FROM pack_item WHERE pack_list_id = $1`,
    [packListId],
  );
  return rij?.volgende ?? 0;
}

async function controleerReiziger(travelerId: string, tripId: string): Promise<void> {
  const reiziger = await queryOne<{ id: string }>(
    `SELECT id FROM traveler WHERE id = $1 AND trip_id = $2`,
    [travelerId, tripId],
  );
  if (!reiziger) throw new ValidationError("Deze reiziger hoort niet bij deze reis");
}

/** Meer dan dit importeer je niet per ongeluk in één keer plakken. */
const MAX_IMPORT_REGELS = 200;

/**
 * Zet geplakte tekst om in een lijst labels: één per regel, opsommingstekens
 * en nummering eraf (uit Notities, Reminders, Keep, Markdown-todo's, wat dan
 * ook), lege regels en interne dubbelingen eruit.
 */
function parseGeplakteRegels(tekst: string): string[] {
  const gezien = new Set<string>();
  const resultaat: string[] = [];
  for (const ruw of tekst.split(/\r?\n/)) {
    const label = ruw
      .replace(/^\s*[-*•☐□✓✔]+\s*/, "")
      .replace(/^\[[ xX]?\]\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .trim();
    if (label === "" || label.length > 120) continue;
    const sleutel = label.toLowerCase();
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    resultaat.push(label);
    if (resultaat.length >= MAX_IMPORT_REGELS) break;
  }
  return resultaat;
}

/**
 * Eigen inpaklijsten: elke lijst heeft een naam die je zelf kiest — Uitrusting,
 * Boodschappen, Fotografie, wat dan ook — en mag optioneel bij één reiziger
 * horen. Onbeperkt lijsten, onbeperkt items per lijst.
 */
export const packListRoutes: FastifyPluginAsync = async (app) => {
  app.get("/trips/:tripId/pack-lists", async (request) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const result = await query<PackListRow>(
      `SELECT ${PACK_LIST_KOLOMMEN} FROM pack_list
       WHERE trip_id = $1 ORDER BY created_at ASC`,
      [tripId],
    );
    return result.rows.map(toPackList);
  });

  app.post("/trips/:tripId/pack-lists", async (request, reply) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const fields = new Fields(request.body);

    const travelerId = fields.optionalUuid("travelerId");
    if (travelerId) await controleerReiziger(travelerId, tripId);

    const row = await queryOne<PackListRow>(
      `INSERT INTO pack_list (trip_id, naam, traveler_id) VALUES ($1, $2, $3)
       RETURNING ${PACK_LIST_KOLOMMEN}`,
      [tripId, fields.text("naam", { max: 80 }), travelerId],
    );
    reply.code(201);
    return toPackList(row!);
  });

  app.patch("/pack-lists/:id", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const bestaand = await haalPackList(id);
    const fields = new Fields(request.body);

    const naam = fields.has("naam") ? fields.text("naam", { max: 80 }) : bestaand.naam;
    let travelerId = bestaand.traveler_id;
    if (fields.has("travelerId")) {
      travelerId = fields.optionalUuid("travelerId");
      if (travelerId) await controleerReiziger(travelerId, bestaand.trip_id);
    }

    const row = await queryOne<PackListRow>(
      `UPDATE pack_list SET naam = $2, traveler_id = $3 WHERE id = $1
       RETURNING ${PACK_LIST_KOLOMMEN}`,
      [id, naam, travelerId],
    );
    return toPackList(row!);
  });

  /** Verwijdert de lijst. De items gaan via cascade mee. */
  app.delete("/pack-lists/:id", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const result = await query(`DELETE FROM pack_list WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundError("Deze inpaklijst bestaat niet");
    reply.code(204);
    return null;
  });

  /**
   * Vult de lijst met een basisset. Items die er al op staan worden
   * overgeslagen, zodat twee keer klikken geen dubbele tent oplevert.
   */
  app.post("/pack-lists/:id/standaardlijst", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const lijst = await haalPackList(id);
    const fields = new Fields(request.body ?? {});
    const soort = fields.has("soort")
      ? fields.oneOf<"uitrusting" | "persoonlijk">("soort", ["uitrusting", "persoonlijk"])
      : "uitrusting";
    const labels = soort === "uitrusting" ? STANDAARD_UITRUSTING : STANDAARD_PERSOONLIJK;

    const toegevoegd = await transaction(async (client) => {
      const bestaand = await client.query<{ label: string }>(
        `SELECT label FROM pack_item WHERE pack_list_id = $1`,
        [id],
      );
      const aanwezig = new Set(bestaand.rows.map((row) => row.label.toLowerCase()));
      let volgorde = await volgendeVolgorde(id);

      const nieuw: PackItemRow[] = [];
      for (const label of labels) {
        if (aanwezig.has(label.toLowerCase())) continue;
        const created = await client.query<PackItemRow>(
          `INSERT INTO pack_item (trip_id, pack_list_id, label, volgorde)
           VALUES ($1, $2, $3, $4) RETURNING ${PACK_ITEM_KOLOMMEN}`,
          [lijst.trip_id, id, label, volgorde],
        );
        volgorde += 1;
        nieuw.push(created.rows[0]!);
      }
      return nieuw;
    });

    return { toegevoegd: toegevoegd.length, items: toegevoegd.map(toPackItem) };
  });

  /**
   * Importeert een geplakte lijst: één item per regel. Veelvoorkomende
   * opsommingstekens en nummering (-, *, •, ☐, 1., 2)) gaan eraf, lege
   * regels tellen niet mee, en zowel binnen de plak-tekst als tegen wat er
   * al op de lijst staat wordt niet dubbel toegevoegd — zodat per ongeluk
   * twee keer plakken geen rommel oplevert.
   */
  app.post("/pack-lists/:id/importeer", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const lijst = await haalPackList(id);
    const fields = new Fields(request.body);
    const labels = parseGeplakteRegels(fields.text("tekst", { max: 8000 }));

    if (labels.length === 0) {
      throw new ValidationError("Geen bruikbare regels gevonden om te importeren");
    }

    const toegevoegd = await transaction(async (client) => {
      const bestaand = await client.query<{ label: string }>(
        `SELECT label FROM pack_item WHERE pack_list_id = $1`,
        [id],
      );
      const aanwezig = new Set(bestaand.rows.map((row) => row.label.toLowerCase()));
      let volgorde = await volgendeVolgorde(id);

      const nieuw: PackItemRow[] = [];
      for (const label of labels) {
        if (aanwezig.has(label.toLowerCase())) continue;
        aanwezig.add(label.toLowerCase());
        const created = await client.query<PackItemRow>(
          `INSERT INTO pack_item (trip_id, pack_list_id, label, volgorde)
           VALUES ($1, $2, $3, $4) RETURNING ${PACK_ITEM_KOLOMMEN}`,
          [lijst.trip_id, id, label, volgorde],
        );
        volgorde += 1;
        nieuw.push(created.rows[0]!);
      }
      return nieuw;
    });

    return {
      toegevoegd: toegevoegd.length,
      overgeslagen: labels.length - toegevoegd.length,
      items: toegevoegd.map(toPackItem),
    };
  });

  /** Wist alle vinkjes in deze lijst. De bevestiging vraagt de app, niet de api. */
  app.post("/pack-lists/:id/wis-vinkjes", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    await haalPackList(id);
    const result = await query(
      `UPDATE pack_item SET afgevinkt = false WHERE pack_list_id = $1 AND afgevinkt = true`,
      [id],
    );
    return { gewist: result.rowCount ?? 0 };
  });

  // --- Items ---------------------------------------------------------------

  app.post("/pack-lists/:id/pack-items", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const lijst = await haalPackList(id);
    const fields = new Fields(request.body);
    const volgorde = await volgendeVolgorde(id);

    const row = await queryOne<PackItemRow>(
      `INSERT INTO pack_item (trip_id, pack_list_id, label, volgorde) VALUES ($1, $2, $3, $4)
       RETURNING ${PACK_ITEM_KOLOMMEN}`,
      [lijst.trip_id, id, fields.text("label", { max: 120 }), volgorde],
    );
    reply.code(201);
    return toPackItem(row!);
  });
};
