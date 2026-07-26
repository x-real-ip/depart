import type { FastifyPluginAsync } from "fastify";
import { query, queryOne, transaction } from "../db.js";
import { toContact, toStop, type ContactRow, type StopRow } from "../types.js";
import { Fields, NotFoundError, ValidationError, leesCoordinaatPaar, pathUuid } from "../validate.js";
import { haalTrip } from "./trips.js";

const STOP_KOLOMMEN = `
  id, trip_id, plaats, tijd, opmerking, volgorde, overnachting, adres, nachten, lat, lon
`;
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

    const overnachting = fields.has("overnachting") ? fields.boolean("overnachting") : false;
    const nachten = leesNachten(fields, overnachting);
    // Komt het adres van de autocomplete, dan is het geverifieerd en gaat de
    // coördinaat direct mee; zonder coördinaat zoekt de app het adres later
    // zelf op (onveranderd bestaand gedrag voor wie vrij typt).
    const coordinaat = leesCoordinaatPaar(fields, "lat", "lon");

    const row = await queryOne<StopRow>(
      `INSERT INTO stop (trip_id, plaats, tijd, opmerking, volgorde, overnachting, adres, nachten, lat, lon)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${STOP_KOLOMMEN}`,
      [
        tripId,
        fields.text("plaats", { max: 120 }),
        fields.optionalTime("tijd"),
        fields.optionalText("opmerking", { max: 500 }),
        volgorde,
        overnachting,
        fields.optionalText("adres", { max: 300 }),
        nachten,
        coordinaat.lat,
        coordinaat.lon,
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
    const adres = fields.has("adres")
      ? fields.optionalText("adres", { max: 300 })
      : bestaand.adres;
    const overnachting = fields.has("overnachting")
      ? fields.boolean("overnachting")
      : bestaand.overnachting;
    const nachten = fields.has("nachten") || fields.has("overnachting")
      ? leesNachten(fields, overnachting, bestaand.nachten)
      : bestaand.nachten;

    // Verse coördinaten van de autocomplete zijn geverifieerd en gaan direct
    // mee. Zonder die coördinaten: bij een andere plaats of ander adres
    // kloppen de oude niet meer en worden ze leeggemaakt (zelfde patroon als
    // bij de reis zelf); anders blijven ze staan.
    const nieuweCoordinaat = leesCoordinaatPaar(fields, "lat", "lon");
    const behoudCoordinaten = plaats === bestaand.plaats && adres === bestaand.adres;
    const lat = nieuweCoordinaat.lat ?? (behoudCoordinaten ? bestaand.lat : null);
    const lon = nieuweCoordinaat.lon ?? (behoudCoordinaten ? bestaand.lon : null);

    const row = await queryOne<StopRow>(
      `UPDATE stop
       SET plaats = $2, tijd = $3, opmerking = $4, adres = $5,
           overnachting = $6, nachten = $7, lat = $8, lon = $9
       WHERE id = $1
       RETURNING ${STOP_KOLOMMEN}`,
      [id, plaats, tijd, opmerking, adres, overnachting, nachten, lat, lon],
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
 * Een overnachting heeft altijd een aantal nachten; een gewone tussenstop
 * nooit. Dezelfde regel staat als CHECK in de database, hier levert hij een
 * leesbare melding op.
 */
function leesNachten(fields: Fields, overnachting: boolean, huidig: number | null = null): number | null {
  if (!overnachting) {
    // Niet stilzwijgend weggooien: wie hier nachten meestuurt, bedoelt
    // waarschijnlijk een overnachting en moet dat weten.
    const meegestuurd = fields.has("nachten") ? fields.optionalNumber("nachten") : null;
    if (meegestuurd !== null) {
      throw new ValidationError(
        "Zet de etappe op overnachting als je een aantal nachten wilt opgeven",
      );
    }
    return null;
  }
  const opgegeven = fields.has("nachten")
    ? fields.optionalNumber("nachten", { min: 1, max: 60 })
    : huidig;
  // Wie een overnachting aanzet zonder aantal, bedoelt één nacht.
  return opgegeven === null ? 1 : Math.round(opgegeven);
}

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
