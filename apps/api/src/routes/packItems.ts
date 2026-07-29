import type { FastifyPluginAsync } from "fastify";
import { query, queryOne, transaction } from "../db.js";
import { toPackItem, type PackItemRow } from "../types.js";
import { Fields, NotFoundError, ValidationError, pathUuid } from "../validate.js";
import { haalTrip } from "./trips.js";

const PACK_ITEM_KOLOMMEN = `id, trip_id, pack_list_id, label, afgevinkt, volgorde, categorie`;

/**
 * Items zelf: aanmaken gaat via een lijst (zie packLists.ts,
 * `POST /pack-lists/:id/pack-items`), maar opvragen, bewerken, verwijderen en
 * herordenen werken op het item zelf.
 */
export const packItemRoutes: FastifyPluginAsync = async (app) => {
  /** Alle items van een reis, over alle lijsten heen — de app filtert zelf per lijst. */
  app.get("/trips/:tripId/pack-items", async (request) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const result = await query<PackItemRow>(
      `SELECT ${PACK_ITEM_KOLOMMEN} FROM pack_item
       WHERE trip_id = $1 ORDER BY volgorde ASC, created_at ASC`,
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
    const categorie = fields.has("categorie")
      ? fields.optionalText("categorie", { max: 60 })
      : bestaand.categorie;

    const row = await queryOne<PackItemRow>(
      `UPDATE pack_item SET label = $2, afgevinkt = $3, categorie = $4 WHERE id = $1
       RETURNING ${PACK_ITEM_KOLOMMEN}`,
      [id, label, afgevinkt, categorie],
    );
    return toPackItem(row!);
  });

  /**
   * Herordent de items van één lijst in één keer, na het verslepen. Net als
   * bij de bestemmingen stuurt de app de volledige lijst ids in de nieuwe
   * volgorde.
   */
  app.put("/pack-lists/:id/pack-items/volgorde", async (request) => {
    const packListId = pathUuid((request.params as { id?: string }).id);
    const ids = new Fields(request.body).uuidList("ids");

    const bestaand = await query<{ id: string }>(
      `SELECT id FROM pack_item WHERE pack_list_id = $1`,
      [packListId],
    );
    const bekendeIds = new Set(bestaand.rows.map((row) => row.id));
    if (ids.length !== bekendeIds.size || ids.some((id) => !bekendeIds.has(id))) {
      throw new ValidationError("De lijst moet precies alle items van deze inpaklijst bevatten");
    }

    await transaction(async (client) => {
      for (const [index, id] of ids.entries()) {
        await client.query(`UPDATE pack_item SET volgorde = $2 WHERE id = $1`, [id, index]);
      }
    });

    const result = await query<PackItemRow>(
      `SELECT ${PACK_ITEM_KOLOMMEN} FROM pack_item WHERE pack_list_id = $1 ORDER BY volgorde ASC`,
      [packListId],
    );
    return result.rows.map(toPackItem);
  });

  app.delete("/pack-items/:id", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const result = await query(`DELETE FROM pack_item WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundError("Dit item bestaat niet");
    reply.code(204);
    return null;
  });
};
