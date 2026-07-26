import type { FastifyPluginAsync } from "fastify";
import { query, queryOne, transaction } from "../db.js";
import { toContact, toStop, type ContactRow, type StopRow } from "../types.js";
import { Fields, NotFoundError, ValidationError, pathUuid } from "../validate.js";
import { haalTrip } from "./trips.js";

const STOP_KOLOMMEN = `id, trip_id, plaats, tijd, opmerking, volgorde`;
const CONTACT_KOLOMMEN = `id, trip_id, label, telefoonnummer`;

export const onderwegRoutes: FastifyPluginAsync = async (app) => {
  // --- Etappes ------------------------------------------------------------

  app.get("/trips/:tripId/stops", async (request) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const result = await query<StopRow>(
      `SELECT ${STOP_KOLOMMEN} FROM stop WHERE trip_id = $1
       ORDER BY volgorde ASC, created_at ASC`,
      [tripId],
    );
    return result.rows.map(toStop);
  });

  app.post("/trips/:tripId/stops", async (request, reply) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const fields = new Fields(request.body);

    // Nieuwe etappe komt achteraan.
    const laatste = await queryOne<{ volgorde: number | null }>(
      `SELECT max(volgorde) AS volgorde FROM stop WHERE trip_id = $1`,
      [tripId],
    );
    const volgorde = (laatste?.volgorde ?? -1) + 1;

    const row = await queryOne<StopRow>(
      `INSERT INTO stop (trip_id, plaats, tijd, opmerking, volgorde)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${STOP_KOLOMMEN}`,
      [
        tripId,
        fields.text("plaats", { max: 120 }),
        fields.optionalTime("tijd"),
        fields.optionalText("opmerking", { max: 500 }),
        volgorde,
      ],
    );
    reply.code(201);
    return toStop(row!);
  });

  app.patch("/stops/:id", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const fields = new Fields(request.body);
    const bestaand = await queryOne<StopRow>(`SELECT ${STOP_KOLOMMEN} FROM stop WHERE id = $1`, [id]);
    if (!bestaand) throw new NotFoundError("Deze etappe bestaat niet");

    const plaats = fields.has("plaats") ? fields.text("plaats", { max: 120 }) : bestaand.plaats;
    const tijd = fields.has("tijd") ? fields.optionalTime("tijd") : bestaand.tijd;
    const opmerking = fields.has("opmerking")
      ? fields.optionalText("opmerking", { max: 500 })
      : bestaand.opmerking;

    const row = await queryOne<StopRow>(
      `UPDATE stop SET plaats = $2, tijd = $3, opmerking = $4 WHERE id = $1
       RETURNING ${STOP_KOLOMMEN}`,
      [id, plaats, tijd, opmerking],
    );
    return toStop(row!);
  });

  /**
   * Herordent de etappes in één keer. De app stuurt de volledige lijst ids in
   * de nieuwe volgorde na het verslepen; dat is eenvoudiger en robuuster dan
   * losse indexen bijwerken.
   */
  app.put("/trips/:tripId/stops/volgorde", async (request) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const ids = new Fields(request.body).uuidList("ids");

    const bestaand = await query<{ id: string }>(`SELECT id FROM stop WHERE trip_id = $1`, [tripId]);
    const bekendeIds = new Set(bestaand.rows.map((row) => row.id));
    if (ids.length !== bekendeIds.size || ids.some((id) => !bekendeIds.has(id))) {
      throw new ValidationError("De lijst moet precies alle etappes van deze reis bevatten");
    }

    await transaction(async (client) => {
      for (const [index, id] of ids.entries()) {
        await client.query(`UPDATE stop SET volgorde = $2 WHERE id = $1`, [id, index]);
      }
    });

    const result = await query<StopRow>(
      `SELECT ${STOP_KOLOMMEN} FROM stop WHERE trip_id = $1 ORDER BY volgorde ASC`,
      [tripId],
    );
    return result.rows.map(toStop);
  });

  app.delete("/stops/:id", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const result = await query(`DELETE FROM stop WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundError("Deze etappe bestaat niet");
    reply.code(204);
    return null;
  });

  // --- Noodnummers --------------------------------------------------------

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
