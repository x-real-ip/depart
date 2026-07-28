import type { FastifyPluginAsync } from "fastify";
import { STANDAARD_TAKEN } from "../defaults.js";
import { query, queryOne, transaction } from "../db.js";
import { parseGeplakteRegels } from "../tekstImport.js";
import { toTaskItem, toTaskList, type TaskItemRow, type TaskListRow } from "../types.js";
import { Fields, NotFoundError, ValidationError, pathUuid } from "../validate.js";
import { haalTrip } from "./trips.js";

const TASK_LIST_KOLOMMEN = `id, trip_id, naam, traveler_id`;
const TASK_ITEM_KOLOMMEN = `id, trip_id, task_list_id, label, afgevinkt, volgorde`;

async function haalTaskList(id: string): Promise<TaskListRow> {
  const row = await queryOne<TaskListRow>(
    `SELECT ${TASK_LIST_KOLOMMEN} FROM task_list WHERE id = $1`,
    [id],
  );
  if (!row) throw new NotFoundError("Deze takenlijst bestaat niet");
  return row;
}

/** Eerstvolgende vrije volgorde op een lijst — nieuwe taken komen achteraan. */
async function volgendeVolgorde(taskListId: string): Promise<number> {
  const rij = await queryOne<{ volgende: number }>(
    `SELECT COALESCE(max(volgorde) + 1, 0) AS volgende FROM task_item WHERE task_list_id = $1`,
    [taskListId],
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

/**
 * Eigen takenlijsten: dingen die vóór vertrek moeten gebeuren, los van de
 * inpaklijsten — post stopzetten, verzekering checken, dat soort werk. Elke
 * lijst heeft een naam die je zelf kiest en mag optioneel bij één reiziger
 * horen. Onbeperkt lijsten, onbeperkt taken per lijst.
 */
export const taskListRoutes: FastifyPluginAsync = async (app) => {
  app.get("/trips/:tripId/task-lists", async (request) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const result = await query<TaskListRow>(
      `SELECT ${TASK_LIST_KOLOMMEN} FROM task_list
       WHERE trip_id = $1 ORDER BY created_at ASC`,
      [tripId],
    );
    return result.rows.map(toTaskList);
  });

  app.post("/trips/:tripId/task-lists", async (request, reply) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const fields = new Fields(request.body);

    const travelerId = fields.optionalUuid("travelerId");
    if (travelerId) await controleerReiziger(travelerId, tripId);

    const row = await queryOne<TaskListRow>(
      `INSERT INTO task_list (trip_id, naam, traveler_id) VALUES ($1, $2, $3)
       RETURNING ${TASK_LIST_KOLOMMEN}`,
      [tripId, fields.text("naam", { max: 80 }), travelerId],
    );
    reply.code(201);
    return toTaskList(row!);
  });

  app.patch("/task-lists/:id", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const bestaand = await haalTaskList(id);
    const fields = new Fields(request.body);

    const naam = fields.has("naam") ? fields.text("naam", { max: 80 }) : bestaand.naam;
    let travelerId = bestaand.traveler_id;
    if (fields.has("travelerId")) {
      travelerId = fields.optionalUuid("travelerId");
      if (travelerId) await controleerReiziger(travelerId, bestaand.trip_id);
    }

    const row = await queryOne<TaskListRow>(
      `UPDATE task_list SET naam = $2, traveler_id = $3 WHERE id = $1
       RETURNING ${TASK_LIST_KOLOMMEN}`,
      [id, naam, travelerId],
    );
    return toTaskList(row!);
  });

  /** Verwijdert de lijst. De taken gaan via cascade mee. */
  app.delete("/task-lists/:id", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const result = await query(`DELETE FROM task_list WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundError("Deze takenlijst bestaat niet");
    reply.code(204);
    return null;
  });

  /**
   * Vult de lijst met een basisset praktische dingen. Taken die er al op
   * staan worden overgeslagen, zodat twee keer klikken geen dubbele lijst
   * oplevert.
   */
  app.post("/task-lists/:id/standaardlijst", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const lijst = await haalTaskList(id);

    const toegevoegd = await transaction(async (client) => {
      const bestaand = await client.query<{ label: string }>(
        `SELECT label FROM task_item WHERE task_list_id = $1`,
        [id],
      );
      const aanwezig = new Set(bestaand.rows.map((row) => row.label.toLowerCase()));
      let volgorde = await volgendeVolgorde(id);

      const nieuw: TaskItemRow[] = [];
      for (const label of STANDAARD_TAKEN) {
        if (aanwezig.has(label.toLowerCase())) continue;
        const created = await client.query<TaskItemRow>(
          `INSERT INTO task_item (trip_id, task_list_id, label, volgorde)
           VALUES ($1, $2, $3, $4) RETURNING ${TASK_ITEM_KOLOMMEN}`,
          [lijst.trip_id, id, label, volgorde],
        );
        volgorde += 1;
        nieuw.push(created.rows[0]!);
      }
      return nieuw;
    });

    return { toegevoegd: toegevoegd.length, items: toegevoegd.map(toTaskItem) };
  });

  /**
   * Importeert een geplakte lijst: één taak per regel. Veelvoorkomende
   * opsommingstekens en nummering gaan eraf, lege regels tellen niet mee, en
   * zowel binnen de plak-tekst als tegen wat er al op de lijst staat wordt
   * niet dubbel toegevoegd.
   */
  app.post("/task-lists/:id/importeer", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const lijst = await haalTaskList(id);
    const fields = new Fields(request.body);
    const labels = parseGeplakteRegels(fields.text("tekst", { max: 8000 }));

    if (labels.length === 0) {
      throw new ValidationError("Geen bruikbare regels gevonden om te importeren");
    }

    const toegevoegd = await transaction(async (client) => {
      const bestaand = await client.query<{ label: string }>(
        `SELECT label FROM task_item WHERE task_list_id = $1`,
        [id],
      );
      const aanwezig = new Set(bestaand.rows.map((row) => row.label.toLowerCase()));
      let volgorde = await volgendeVolgorde(id);

      const nieuw: TaskItemRow[] = [];
      for (const label of labels) {
        if (aanwezig.has(label.toLowerCase())) continue;
        aanwezig.add(label.toLowerCase());
        const created = await client.query<TaskItemRow>(
          `INSERT INTO task_item (trip_id, task_list_id, label, volgorde)
           VALUES ($1, $2, $3, $4) RETURNING ${TASK_ITEM_KOLOMMEN}`,
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
      items: toegevoegd.map(toTaskItem),
    };
  });

  /** Wist alle vinkjes in deze lijst. De bevestiging vraagt de app, niet de api. */
  app.post("/task-lists/:id/wis-vinkjes", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    await haalTaskList(id);
    const result = await query(
      `UPDATE task_item SET afgevinkt = false WHERE task_list_id = $1 AND afgevinkt = true`,
      [id],
    );
    return { gewist: result.rowCount ?? 0 };
  });

  // --- Taken -----------------------------------------------------------------

  app.post("/task-lists/:id/task-items", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const lijst = await haalTaskList(id);
    const fields = new Fields(request.body);
    const volgorde = await volgendeVolgorde(id);

    const row = await queryOne<TaskItemRow>(
      `INSERT INTO task_item (trip_id, task_list_id, label, volgorde) VALUES ($1, $2, $3, $4)
       RETURNING ${TASK_ITEM_KOLOMMEN}`,
      [lijst.trip_id, id, fields.text("label", { max: 120 }), volgorde],
    );
    reply.code(201);
    return toTaskItem(row!);
  });
};
