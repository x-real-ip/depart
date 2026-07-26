import type { FastifyPluginAsync } from "fastify";
import { query, queryOne } from "../db.js";
import { toPackItem, type PackItemRow } from "../types.js";
import { Fields, NotFoundError, pathUuid } from "../validate.js";
import { haalTrip } from "./trips.js";

const PACK_ITEM_KOLOMMEN = `id, trip_id, pack_list_id, label, afgevinkt`;

/**
 * Items zelf: aanmaken gaat via een lijst (zie packLists.ts,
 * `POST /pack-lists/:id/pack-items`), maar opvragen, bewerken en verwijderen
 * werken op het item zelf.
 */
export const packItemRoutes: FastifyPluginAsync = async (app) => {
  /** Alle items van een reis, over alle lijsten heen — de app filtert zelf per lijst. */
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
