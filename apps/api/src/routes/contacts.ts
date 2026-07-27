import type { FastifyPluginAsync } from "fastify";
import { query, queryOne } from "../db.js";
import { toContact, type ContactRow } from "../types.js";
import { Fields, NotFoundError, ValidationError, pathUuid } from "../validate.js";
import { haalTrip } from "./trips.js";

const CONTACT_KOLOMMEN = `id, trip_id, label, telefoonnummer`;

/** Noodnummers: grote knoppen met een tel:-link op het tabblad Onderweg. */
export const contactRoutes: FastifyPluginAsync = async (app) => {
  app.get("/trips/:tripId/contacts", async (request) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const result = await query<ContactRow>(
      `SELECT ${CONTACT_KOLOMMEN} FROM contact WHERE trip_id = $1 ORDER BY created_at ASC`,
      [tripId],
    );
    return result.rows.map(toContact);
  });

  app.post("/trips/:tripId/contacts", async (request, reply) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const fields = new Fields(request.body);
    const row = await queryOne<ContactRow>(
      `INSERT INTO contact (trip_id, label, telefoonnummer) VALUES ($1, $2, $3)
       RETURNING ${CONTACT_KOLOMMEN}`,
      [tripId, fields.text("label", { max: 80 }), telefoonnummer(fields)],
    );
    reply.code(201);
    return toContact(row!);
  });

  app.patch("/contacts/:id", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const fields = new Fields(request.body);
    const bestaand = await queryOne<ContactRow>(
      `SELECT ${CONTACT_KOLOMMEN} FROM contact WHERE id = $1`,
      [id],
    );
    if (!bestaand) throw new NotFoundError("Dit nummer bestaat niet");

    const label = fields.has("label") ? fields.text("label", { max: 80 }) : bestaand.label;
    const nummer = fields.has("telefoonnummer") ? telefoonnummer(fields) : bestaand.telefoonnummer;

    const row = await queryOne<ContactRow>(
      `UPDATE contact SET label = $2, telefoonnummer = $3 WHERE id = $1
       RETURNING ${CONTACT_KOLOMMEN}`,
      [id, label, nummer],
    );
    return toContact(row!);
  });

  app.delete("/contacts/:id", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const result = await query(`DELETE FROM contact WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundError("Dit nummer bestaat niet");
    reply.code(204);
    return null;
  });
};

/**
 * Een telefoonnummer moet in een tel:-link passen. Cijfers, plus, spaties,
 * streepjes en haakjes zijn genoeg; al het andere hoort er niet in.
 */
function telefoonnummer(fields: Fields): string {
  const waarde = fields.text("telefoonnummer", { max: 32 });
  if (!/^[+0-9][0-9 ()-]*$/.test(waarde)) {
    throw new ValidationError("Een telefoonnummer bestaat uit cijfers, eventueel met + ervoor");
  }
  return waarde;
}
