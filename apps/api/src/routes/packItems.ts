import type { FastifyPluginAsync } from "fastify";
import { STANDAARD_KOFFER, STANDAARD_UITRUSTING } from "../defaults.js";
import { query, queryOne, transaction } from "../db.js";
import { toPackItem, type PackGroep, type PackItemRow } from "../types.js";
import { Fields, NotFoundError, ValidationError, pathUuid } from "../validate.js";
import { haalTrip } from "./trips.js";

const PACK_ITEM_KOLOMMEN = `id, trip_id, traveler_id, groep, label, afgevinkt`;

export const packItemRoutes: FastifyPluginAsync = async (app) => {
  app.get("/trips/:tripId/pack-items", async (request) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const result = await query<PackItemRow>(
      `SELECT ${PACK_ITEM_KOLOMMEN} FROM pack_item
       WHERE trip_id = $1 ORDER BY created_at ASC`,
      [tripId],
    );
    return result.rows.map(toPackItem);
  });

  app.post("/trips/:tripId/pack-items", async (request, reply) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const fields = new Fields(request.body);

    const groep = fields.oneOf<PackGroep>("groep", ["uitrusting", "koffer"]);
    const travelerId = fields.optionalUuid("travelerId");
    controleerGroep(groep, travelerId);
    if (travelerId) await controleerReiziger(travelerId, tripId);

    const row = await queryOne<PackItemRow>(
      `INSERT INTO pack_item (trip_id, traveler_id, groep, label)
       VALUES ($1, $2, $3, $4) RETURNING ${PACK_ITEM_KOLOMMEN}`,
      [tripId, travelerId, groep, fields.text("label", { max: 120 })],
    );
    reply.code(201);
    return toPackItem(row!);
  });

  /**
   * Vult de kampeer-basislijst aan. Items die al op de lijst staan worden
   * overgeslagen, zodat twee keer klikken geen dubbele tent oplevert.
   */
  app.post("/trips/:tripId/pack-items/standaardlijst", async (request) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const fields = new Fields(request.body ?? {});
    const groep = fields.has("groep")
      ? fields.oneOf<PackGroep>("groep", ["uitrusting", "koffer"])
      : "uitrusting";
    const travelerId = fields.optionalUuid("travelerId");
    controleerGroep(groep, travelerId);
    if (travelerId) await controleerReiziger(travelerId, tripId);

    const labels = groep === "uitrusting" ? STANDAARD_UITRUSTING : STANDAARD_KOFFER;

    const toegevoegd = await transaction(async (client) => {
      const bestaand = await client.query<{ label: string }>(
        `SELECT label FROM pack_item
         WHERE trip_id = $1 AND groep = $2 AND traveler_id IS NOT DISTINCT FROM $3`,
        [tripId, groep, travelerId],
      );
      const aanwezig = new Set(bestaand.rows.map((row) => row.label.toLowerCase()));

      const nieuw: PackItemRow[] = [];
      for (const label of labels) {
        if (aanwezig.has(label.toLowerCase())) continue;
        const created = await client.query<PackItemRow>(
          `INSERT INTO pack_item (trip_id, traveler_id, groep, label)
           VALUES ($1, $2, $3, $4) RETURNING ${PACK_ITEM_KOLOMMEN}`,
          [tripId, travelerId, groep, label],
        );
        nieuw.push(created.rows[0]!);
      }
      return nieuw;
    });

    return { toegevoegd: toegevoegd.length, items: toegevoegd.map(toPackItem) };
  });

  /** Wist alle vinkjes. De bevestiging vraagt de app, niet de api. */
  app.post("/trips/:tripId/pack-items/wis-vinkjes", async (request) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const fields = new Fields(request.body ?? {});

    // Zonder groep: alles. Met groep: alleen die lijst.
    const filters: string[] = ["trip_id = $1", "afgevinkt = true"];
    const params: unknown[] = [tripId];
    if (fields.has("groep")) {
      params.push(fields.oneOf<PackGroep>("groep", ["uitrusting", "koffer"]));
      filters.push(`groep = $${params.length}`);
    }
    if (fields.has("travelerId")) {
      params.push(fields.optionalUuid("travelerId"));
      filters.push(`traveler_id IS NOT DISTINCT FROM $${params.length}`);
    }

    const result = await query(
      `UPDATE pack_item SET afgevinkt = false WHERE ${filters.join(" AND ")}`,
      params,
    );
    return { gewist: result.rowCount ?? 0 };
  });

  app.patch("/pack-items/:id", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const fields = new Fields(request.body);
    const bestaand = await queryOne<PackItemRow>(
      `SELECT ${PACK_ITEM_KOLOMMEN} FROM pack_item WHERE id = $1`,
      [id],
    );
    if (!bestaand) throw new NotFoundError("Dit item bestaat niet");

    const label = fields.has("label") ? fields.text("label", { max: 120 }) : bestaand.label;
    const afgevinkt = fields.has("afgevinkt") ? fields.boolean("afgevinkt") : bestaand.afgevinkt;

    const row = await queryOne<PackItemRow>(
      `UPDATE pack_item SET label = $2, afgevinkt = $3 WHERE id = $1
       RETURNING ${PACK_ITEM_KOLOMMEN}`,
      [id, label, afgevinkt],
    );
    return toPackItem(row!);
  });

  app.delete("/pack-items/:id", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const result = await query(`DELETE FROM pack_item WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundError("Dit item bestaat niet");
    reply.code(204);
    return null;
  });
};

/**
 * Uitrusting is gezamenlijk, een koffer hoort bij één reiziger. Dezelfde regel
 * staat als CHECK in de database; hier levert hij een leesbare melding op.
 */
function controleerGroep(groep: PackGroep, travelerId: string | null): void {
  if (groep === "uitrusting" && travelerId !== null) {
    throw new ValidationError("Uitrusting is gezamenlijk en hoort niet bij één reiziger");
  }
  if (groep === "koffer" && travelerId === null) {
    throw new ValidationError("Kies bij een koffer de reiziger waar het item bij hoort");
  }
}

async function controleerReiziger(travelerId: string, tripId: string): Promise<void> {
  const reiziger = await queryOne<{ id: string }>(
    `SELECT id FROM traveler WHERE id = $1 AND trip_id = $2`,
    [travelerId, tripId],
  );
  if (!reiziger) throw new ValidationError("Deze reiziger hoort niet bij deze reis");
}
