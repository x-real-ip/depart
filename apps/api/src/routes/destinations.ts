import type { FastifyPluginAsync } from "fastify";
import { query, queryOne, transaction } from "../db.js";
import { toDestination, type DestinationRow } from "../types.js";
import { Fields, NotFoundError, ValidationError, leesCoordinaatPaar, pathUuid } from "../validate.js";
import { haalTrip } from "./trips.js";

const DESTINATION_KOLOMMEN = `
  id, trip_id, naam, plaats, land, regio, adres, plaatsnummer, opmerking,
  incheckdatum, inchecktijd, uitcheckdatum, uitchecktijd, volgorde, lat, lon
`;

async function haalDestination(id: string): Promise<DestinationRow> {
  const row = await queryOne<DestinationRow>(
    `SELECT ${DESTINATION_KOLOMMEN} FROM destination WHERE id = $1`,
    [id],
  );
  if (!row) throw new NotFoundError("Deze bestemming bestaat niet");
  return row;
}

/**
 * Leest de velden van een bestemming uit een aanvraag. Alleen `plaats` is
 * verplicht — van een korte tussenstop tot een meerdaags verblijf is dezelfde
 * bestemming, met meer of minder ingevuld.
 */
function leesDestinationVelden(fields: Fields) {
  const incheckdatum = fields.optionalDate("incheckdatum");
  const uitcheckdatum = fields.optionalDate("uitcheckdatum");
  if (incheckdatum !== null && uitcheckdatum !== null && uitcheckdatum < incheckdatum) {
    throw new ValidationError("De uitcheckdatum kan niet voor de incheckdatum liggen");
  }
  return {
    naam: fields.optionalText("naam", { max: 160 }),
    plaats: fields.text("plaats", { max: 120 }),
    land: fields.optionalText("land", { max: 120 }),
    regio: fields.optionalText("regio", { max: 120 }),
    adres: fields.optionalText("adres", { max: 300 }),
    plaatsnummer: fields.optionalText("plaatsnummer", { max: 40 }),
    opmerking: fields.optionalText("opmerking", { max: 500 }),
    incheckdatum,
    inchecktijd: fields.optionalTime("inchecktijd"),
    uitcheckdatum,
    uitchecktijd: fields.optionalTime("uitchecktijd"),
  };
}

export const destinationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/trips/:tripId/destinations", async (request) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const result = await query<DestinationRow>(
      `SELECT ${DESTINATION_KOLOMMEN} FROM destination
       WHERE trip_id = $1 ORDER BY volgorde ASC, created_at ASC`,
      [tripId],
    );
    return result.rows.map(toDestination);
  });

  app.post("/trips/:tripId/destinations", async (request, reply) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const fields = new Fields(request.body);
    const waarden = leesDestinationVelden(fields);
    const coordinaat = leesCoordinaatPaar(fields, "lat", "lon");

    // Nieuwe bestemming komt achteraan — de laatste in de volgorde is de
    // eindbestemming van de reis.
    const laatste = await queryOne<{ volgorde: number | null }>(
      `SELECT max(volgorde) AS volgorde FROM destination WHERE trip_id = $1`,
      [tripId],
    );
    const volgorde = (laatste?.volgorde ?? -1) + 1;

    const row = await queryOne<DestinationRow>(
      `INSERT INTO destination (
         trip_id, naam, plaats, land, regio, adres, plaatsnummer, opmerking,
         incheckdatum, inchecktijd, uitcheckdatum, uitchecktijd, volgorde, lat, lon
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING ${DESTINATION_KOLOMMEN}`,
      [
        tripId,
        waarden.naam,
        waarden.plaats,
        waarden.land,
        waarden.regio,
        waarden.adres,
        waarden.plaatsnummer,
        waarden.opmerking,
        waarden.incheckdatum,
        waarden.inchecktijd,
        waarden.uitcheckdatum,
        waarden.uitchecktijd,
        volgorde,
        coordinaat.lat,
        coordinaat.lon,
      ],
    );
    reply.code(201);
    return toDestination(row!);
  });

  app.patch("/destinations/:id", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const bestaand = await haalDestination(id);
    const fields = new Fields(request.body);

    const naam = fields.has("naam") ? fields.optionalText("naam", { max: 160 }) : bestaand.naam;
    const plaats = fields.has("plaats") ? fields.text("plaats", { max: 120 }) : bestaand.plaats;
    const land = fields.has("land") ? fields.optionalText("land", { max: 120 }) : bestaand.land;
    const regio = fields.has("regio") ? fields.optionalText("regio", { max: 120 }) : bestaand.regio;
    const adres = fields.has("adres") ? fields.optionalText("adres", { max: 300 }) : bestaand.adres;
    const plaatsnummer = fields.has("plaatsnummer")
      ? fields.optionalText("plaatsnummer", { max: 40 })
      : bestaand.plaatsnummer;
    const opmerking = fields.has("opmerking")
      ? fields.optionalText("opmerking", { max: 500 })
      : bestaand.opmerking;
    const incheckdatum = fields.has("incheckdatum")
      ? fields.optionalDate("incheckdatum")
      : bestaand.incheckdatum;
    const inchecktijd = fields.has("inchecktijd")
      ? fields.optionalTime("inchecktijd")
      : bestaand.inchecktijd;
    const uitcheckdatum = fields.has("uitcheckdatum")
      ? fields.optionalDate("uitcheckdatum")
      : bestaand.uitcheckdatum;
    const uitchecktijd = fields.has("uitchecktijd")
      ? fields.optionalTime("uitchecktijd")
      : bestaand.uitchecktijd;

    if (incheckdatum !== null && uitcheckdatum !== null && uitcheckdatum < incheckdatum) {
      throw new ValidationError("De uitcheckdatum kan niet voor de incheckdatum liggen");
    }

    // Verse coördinaten van de autocomplete zijn geverifieerd en gaan direct
    // mee. Zonder die coördinaten: bij een andere plaats of ander adres
    // kloppen de oude niet meer en worden ze leeggemaakt; anders blijven ze
    // staan.
    const nieuweCoordinaat = leesCoordinaatPaar(fields, "lat", "lon");
    const behoudCoordinaten = plaats === bestaand.plaats && adres === bestaand.adres;
    const lat = nieuweCoordinaat.lat ?? (behoudCoordinaten ? bestaand.lat : null);
    const lon = nieuweCoordinaat.lon ?? (behoudCoordinaten ? bestaand.lon : null);

    const row = await queryOne<DestinationRow>(
      `UPDATE destination
       SET naam = $2, plaats = $3, land = $4, regio = $5, adres = $6, plaatsnummer = $7,
           opmerking = $8, incheckdatum = $9, inchecktijd = $10, uitcheckdatum = $11,
           uitchecktijd = $12, lat = $13, lon = $14
       WHERE id = $1
       RETURNING ${DESTINATION_KOLOMMEN}`,
      [id, naam, plaats, land, regio, adres, plaatsnummer, opmerking, incheckdatum, inchecktijd, uitcheckdatum, uitchecktijd, lat, lon],
    );
    return toDestination(row!);
  });

  /**
   * Herordent de bestemmingen in één keer. De app stuurt de volledige lijst
   * ids in de nieuwe volgorde na het verslepen; de laatste in die lijst wordt
   * daarmee de nieuwe eindbestemming.
   */
  app.put("/trips/:tripId/destinations/volgorde", async (request) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const ids = new Fields(request.body).uuidList("ids");

    const bestaand = await query<{ id: string }>(
      `SELECT id FROM destination WHERE trip_id = $1`,
      [tripId],
    );
    const bekendeIds = new Set(bestaand.rows.map((row) => row.id));
    if (ids.length !== bekendeIds.size || ids.some((id) => !bekendeIds.has(id))) {
      throw new ValidationError("De lijst moet precies alle bestemmingen van deze reis bevatten");
    }

    await transaction(async (client) => {
      for (const [index, id] of ids.entries()) {
        await client.query(`UPDATE destination SET volgorde = $2 WHERE id = $1`, [id, index]);
      }
    });

    const result = await query<DestinationRow>(
      `SELECT ${DESTINATION_KOLOMMEN} FROM destination WHERE trip_id = $1 ORDER BY volgorde ASC`,
      [tripId],
    );
    return result.rows.map(toDestination);
  });

  app.delete("/destinations/:id", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const result = await query(`DELETE FROM destination WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundError("Deze bestemming bestaat niet");
    reply.code(204);
    return null;
  });
};

export { leesDestinationVelden };
