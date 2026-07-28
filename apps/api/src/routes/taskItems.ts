import type { FastifyPluginAsync } from "fastify";
import { query, queryOne, transaction } from "../db.js";
import { toTaskItem, type TaskItemRow } from "../types.js";
import { Fields, NotFoundError, ValidationError, pathUuid } from "../validate.js";
import { haalTrip } from "./trips.js";

const TASK_ITEM_KOLOMMEN = `id, trip_id, task_list_id, label, afgevinkt, volgorde`;

/**
 * Taken zelf: aanmaken gaat via een lijst (zie taskLists.ts,
 * `POST /task-lists/:id/task-items`), maar opvragen, bewerken, verwijderen en
 * herordenen werken op de taak zelf.
 */
export const taskItemRoutes: FastifyPluginAsync = async (app) => {
  /** Alle taken van een reis, over alle lijsten heen — de app filtert zelf per lijst. */
  app.get("/trips/:tripId/task-items", async (request) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const result = await query<TaskItemRow>(
      `SELECT ${TASK_ITEM_KOLOMMEN} FROM task_item
       WHERE trip_id = $1 ORDER BY volgorde ASC, created_at ASC`,
      [tripId],
    );
    return result.rows.map(toTaskItem);
  });

  app.patch("/task-items/:id", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const fields = new Fields(request.body);
    const bestaand = await queryOne<TaskItemRow>(
      `SELECT ${TASK_ITEM_KOLOMMEN} FROM task_item WHERE id = $1`,
      [id],
    );
    if (!bestaand) throw new NotFoundError("Deze taak bestaat niet");

    const label = fields.has("label") ? fields.text("label", { max: 120 }) : bestaand.label;
    const afgevinkt = fields.has("afgevinkt") ? fields.boolean("afgevinkt") : bestaand.afgevinkt;

    const row = await queryOne<TaskItemRow>(
      `UPDATE task_item SET label = $2, afgevinkt = $3 WHERE id = $1
       RETURNING ${TASK_ITEM_KOLOMMEN}`,
      [id, label, afgevinkt],
    );
    return toTaskItem(row!);
  });

  /**
   * Herordent de taken van één lijst in één keer, na het verslepen. Net als
   * bij de bestemmingen en de inpaklijst stuurt de app de volledige lijst
   * ids in de nieuwe volgorde.
   */
  app.put("/task-lists/:id/task-items/volgorde", async (request) => {
    const taskListId = pathUuid((request.params as { id?: string }).id);
    const ids = new Fields(request.body).uuidList("ids");

    const bestaand = await query<{ id: string }>(
      `SELECT id FROM task_item WHERE task_list_id = $1`,
      [taskListId],
    );
    const bekendeIds = new Set(bestaand.rows.map((row) => row.id));
    if (ids.length !== bekendeIds.size || ids.some((id) => !bekendeIds.has(id))) {
      throw new ValidationError("De lijst moet precies alle taken van deze takenlijst bevatten");
    }

    await transaction(async (client) => {
      for (const [index, id] of ids.entries()) {
        await client.query(`UPDATE task_item SET volgorde = $2 WHERE id = $1`, [id, index]);
      }
    });

    const result = await query<TaskItemRow>(
      `SELECT ${TASK_ITEM_KOLOMMEN} FROM task_item WHERE task_list_id = $1 ORDER BY volgorde ASC`,
      [taskListId],
    );
    return result.rows.map(toTaskItem);
  });

  app.delete("/task-items/:id", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const result = await query(`DELETE FROM task_item WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundError("Deze taak bestaat niet");
    reply.code(204);
    return null;
  });
};
