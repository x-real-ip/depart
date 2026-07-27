import type { FastifyPluginAsync } from "fastify";
import { query, queryOne } from "../db.js";
import { toRequirement, type RequirementRow } from "../types.js";
import { Fields, NotFoundError, pathUuid } from "../validate.js";
import { haalTrip } from "./trips.js";

const REQUIREMENT_KOLOMMEN = `id, trip_id, label, afgevinkt, volgorde`;

/**
 * De checklist reisdocumenten: paspoort, rijbewijs, reisverzekering en
 * dergelijke. Eén platte lijst per reis, met een standaardset bij het
 * aanmaken van de reis (zie trips.ts) — hier alleen opvragen, afvinken,
 * hernoemen, toevoegen en verwijderen.
 */
export const requirementRoutes: FastifyPluginAsync = async (app) => {
  app.get("/trips/:tripId/requirements", async (request) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const result = await query<RequirementRow>(
      `SELECT ${REQUIREMENT_KOLOMMEN} FROM requirement
       WHERE trip_id = $1 ORDER BY volgorde ASC, created_at ASC`,
      [tripId],
    );
    return result.rows.map(toRequirement);
  });

  app.post("/trips/:tripId/requirements", async (request, reply) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const fields = new Fields(request.body);
    const volgende = await queryOne<{ volgende: number }>(
      `SELECT COALESCE(max(volgorde) + 1, 0) AS volgende FROM requirement WHERE trip_id = $1`,
      [tripId],
    );
    const row = await queryOne<RequirementRow>(
      `INSERT INTO requirement (trip_id, label, volgorde) VALUES ($1, $2, $3)
       RETURNING ${REQUIREMENT_KOLOMMEN}`,
      [tripId, fields.text("label", { max: 120 }), volgende?.volgende ?? 0],
    );
    reply.code(201);
    return toRequirement(row!);
  });

  app.patch("/requirements/:id", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const fields = new Fields(request.body);
    const bestaand = await queryOne<RequirementRow>(
      `SELECT ${REQUIREMENT_KOLOMMEN} FROM requirement WHERE id = $1`,
      [id],
    );
    if (!bestaand) throw new NotFoundError("Dit item bestaat niet");

    const label = fields.has("label") ? fields.text("label", { max: 120 }) : bestaand.label;
    const afgevinkt = fields.has("afgevinkt") ? fields.boolean("afgevinkt") : bestaand.afgevinkt;

    const row = await queryOne<RequirementRow>(
      `UPDATE requirement SET label = $2, afgevinkt = $3 WHERE id = $1
       RETURNING ${REQUIREMENT_KOLOMMEN}`,
      [id, label, afgevinkt],
    );
    return toRequirement(row!);
  });

  app.delete("/requirements/:id", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const result = await query(`DELETE FROM requirement WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundError("Dit item bestaat niet");
    reply.code(204);
    return null;
  });
};
