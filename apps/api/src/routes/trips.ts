import type { FastifyPluginAsync } from "fastify";
import { query, queryOne, transaction } from "../db.js";
import { verwijderBestand, verwijderReisMap } from "../storage.js";
import {
  documentStatus,
  toDocument,
  toTraveler,
  toTrip,
  tripColumns,
  type DocumentRow,
  type TravelerRow,
  type TripRow,
} from "../types.js";
import { Fields, NotFoundError, ValidationError, leesCoordinaatPaar, pathUuid } from "../validate.js";

export async function haalTrip(id: string): Promise<TripRow> {
  const row = await queryOne<TripRow>(`SELECT ${tripColumns} FROM trip WHERE id = $1`, [id]);
  if (!row) throw new NotFoundError("Deze reis bestaat niet");
  return row;
}

export const tripRoutes: FastifyPluginAsync = async (app) => {
  // Alle reizen, de eerstvolgende vertrekdatum bovenaan.
  app.get("/trips", async () => {
    const result = await query<TripRow>(
      `SELECT ${tripColumns} FROM trip ORDER BY vertrekdatum ASC, naam ASC`,
    );
    return result.rows.map(toTrip);
  });

  app.get("/trips/:id", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const trip = await haalTrip(id);
    const travelers = await query<TravelerRow>(
      `SELECT id, trip_id, naam, geboortejaar FROM traveler
       WHERE trip_id = $1 ORDER BY created_at ASC`,
      [id],
    );
    return { ...toTrip(trip), reizigers: travelers.rows.map(toTraveler) };
  });

  /**
   * Maakt een reis aan, eventueel met reizigers in één keer. Dat scheelt het
   * startscherm een tweede aanroep en houdt de reis en haar reizigers in één
   * transactie bij elkaar.
   */
  app.post("/trips", async (request, reply) => {
    const fields = new Fields(request.body);
    const waarden = leesTripVelden(fields);

    const reizigers: { naam: string; geboortejaar: number | null }[] = [];
    if (fields.has("reizigers")) {
      const raw = fields.raw("reizigers");
      if (!Array.isArray(raw)) {
        throw new ValidationError("reizigers moet een lijst zijn");
      }
      for (const entry of raw) {
        const reiziger = new Fields(entry);
        reizigers.push({
          naam: reiziger.text("naam", { max: 80 }),
          geboortejaar: reiziger.optionalNumber("geboortejaar", { min: 1900, max: 2200 }),
        });
      }
    }

    const trip = await transaction(async (client) => {
      const created = await client.query<TripRow>(
        `INSERT INTO trip (naam, bestemming, land, regio, vertrekdatum, terugdatum,
                           camping_naam, plaatsnummer, plaats_info,
                           afstand_km, rijtijd_min, tol_kosten,
                           thuisplaats, thuisland, thuisadres, thuis_lat, thuis_lon,
                           bestemming_adres, bestemming_lat, bestemming_lon)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
         RETURNING ${tripColumns}`,
        [
          waarden.naam,
          waarden.bestemming,
          waarden.land,
          waarden.regio,
          waarden.vertrekdatum,
          waarden.terugdatum,
          waarden.campingNaam,
          waarden.plaatsnummer,
          waarden.plaatsInfo,
          waarden.afstandKm,
          waarden.rijtijdMin,
          waarden.tolKosten,
          waarden.thuisplaats,
          waarden.thuisland,
          waarden.thuisAdres,
          waarden.thuisLat,
          waarden.thuisLon,
          waarden.bestemmingAdres,
          waarden.bestemmingLat,
          waarden.bestemmingLon,
        ],
      );
      const row = created.rows[0]!;

      for (const reiziger of reizigers) {
        await client.query(
          `INSERT INTO traveler (trip_id, naam, geboortejaar) VALUES ($1, $2, $3)`,
          [row.id, reiziger.naam, reiziger.geboortejaar],
        );
      }
      return row;
    });

    reply.code(201);
    const travelers = await query<TravelerRow>(
      `SELECT id, trip_id, naam, geboortejaar FROM traveler
       WHERE trip_id = $1 ORDER BY created_at ASC`,
      [trip.id],
    );
    return { ...toTrip(trip), reizigers: travelers.rows.map(toTraveler) };
  });

  app.patch("/trips/:id", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const bestaand = await haalTrip(id);
    const fields = new Fields(request.body);

    const kolommen: Record<string, unknown> = {};
    if (fields.has("naam")) kolommen["naam"] = fields.text("naam", { max: 120 });
    if (fields.has("bestemming")) kolommen["bestemming"] = fields.text("bestemming", { max: 120 });
    if (fields.has("land")) kolommen["land"] = fields.text("land", { max: 120 });
    if (fields.has("thuisplaats")) kolommen["thuisplaats"] = fields.optionalText("thuisplaats", { max: 160 });
    if (fields.has("thuisland")) kolommen["thuisland"] = fields.optionalText("thuisland", { max: 120 });
    if (fields.has("thuisAdres")) kolommen["thuisadres"] = fields.optionalText("thuisAdres", { max: 300 });
    if (fields.has("bestemmingAdres")) {
      kolommen["bestemming_adres"] = fields.optionalText("bestemmingAdres", { max: 300 });
    }
    if (fields.has("regio")) kolommen["regio"] = fields.optionalText("regio", { max: 120 });
    if (fields.has("vertrekdatum")) kolommen["vertrekdatum"] = fields.date("vertrekdatum");
    if (fields.has("terugdatum")) kolommen["terugdatum"] = fields.date("terugdatum");
    if (fields.has("campingNaam")) kolommen["camping_naam"] = fields.optionalText("campingNaam", { max: 160 });
    if (fields.has("plaatsnummer")) kolommen["plaatsnummer"] = fields.optionalText("plaatsnummer", { max: 40 });
    if (fields.has("plaatsInfo")) kolommen["plaats_info"] = fields.optionalText("plaatsInfo", { max: 1000 });
    if (fields.has("afstandKm")) kolommen["afstand_km"] = fields.optionalNumber("afstandKm", { max: 30_000 });
    if (fields.has("rijtijdMin")) kolommen["rijtijd_min"] = fields.optionalNumber("rijtijdMin", { max: 100_000 });
    if (fields.has("tolKosten")) kolommen["tol_kosten"] = fields.optionalNumber("tolKosten", { max: 10_000 });

    // Stuurt de autocomplete verse coördinaten mee, dan zijn die geverifieerd
    // en gaan ze direct de database in — dat overschrijft de invalidatie
    // hieronder. Verandert een plaatsnaam of het adres zonder nieuwe
    // coördinaten, dan kloppen de oude niet meer en worden ze leeggemaakt; bij
    // de volgende weer- of route-aanvraag zoekt de app de stad dan opnieuw op.
    const bestemmingCoord = leesCoordinaatPaar(fields, "bestemmingLat", "bestemmingLon");
    if (bestemmingCoord.lat !== null) {
      kolommen["bestemming_lat"] = bestemmingCoord.lat;
      kolommen["bestemming_lon"] = bestemmingCoord.lon;
    } else if (
      (kolommen["bestemming"] !== undefined && kolommen["bestemming"] !== bestaand.bestemming) ||
      (kolommen["land"] !== undefined && kolommen["land"] !== bestaand.land) ||
      (kolommen["bestemming_adres"] !== undefined &&
        kolommen["bestemming_adres"] !== bestaand.bestemming_adres)
    ) {
      kolommen["bestemming_lat"] = null;
      kolommen["bestemming_lon"] = null;
    }

    const thuisCoord = leesCoordinaatPaar(fields, "thuisLat", "thuisLon");
    if (thuisCoord.lat !== null) {
      kolommen["thuis_lat"] = thuisCoord.lat;
      kolommen["thuis_lon"] = thuisCoord.lon;
    } else if (
      (kolommen["thuisplaats"] !== undefined && kolommen["thuisplaats"] !== bestaand.thuisplaats) ||
      (kolommen["thuisland"] !== undefined && kolommen["thuisland"] !== bestaand.thuisland) ||
      (kolommen["thuisadres"] !== undefined && kolommen["thuisadres"] !== bestaand.thuisadres)
    ) {
      kolommen["thuis_lat"] = null;
      kolommen["thuis_lon"] = null;
    }

    const namen = Object.keys(kolommen);
    if (namen.length === 0) return toTrip(bestaand);

    const setDelen = namen.map((naam, index) => `${naam} = $${index + 2}`);
    const updated = await queryOne<TripRow>(
      `UPDATE trip SET ${setDelen.join(", ")} WHERE id = $1 RETURNING ${tripColumns}`,
      [id, ...namen.map((naam) => kolommen[naam])],
    );
    return toTrip(updated!);
  });

  /** Verwijdert de reis. De database ruimt via cascade alles op wat eraan hangt. */
  app.delete("/trips/:id", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    await haalTrip(id);
    await query(`DELETE FROM trip WHERE id = $1`, [id]);
    // Pas de bestanden weghalen als de rijen weg zijn: liever een bestand te
    // veel op schijf dan een rij die naar een verdwenen bestand wijst.
    await verwijderReisMap(id);
    reply.code(204);
    return null;
  });

  /**
   * Samenvatting voor het overzichtsscherm: de statusregels in één aanroep,
   * zodat het scherm niet meerdere keren hoeft te vragen.
   */
  app.get("/trips/:id/overzicht", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const trip = await haalTrip(id);

    const documenten = await query<DocumentRow>(
      `SELECT id, trip_id, traveler_id, type, omschrijving, geldig_tot,
              bestandspad, bestandsnaam, mimetype, grootte
       FROM document WHERE trip_id = $1`,
      [id],
    );
    const statussen = documenten.rows.map((row) => documentStatus(row, trip.terugdatum));

    // Eén gecombineerd cijfer over alle inpaklijsten heen — hoeveel dat er
    // zijn maakt voor de status "ben ik klaar om te vertrekken" niet uit.
    const pakItems = await query<{ afgevinkt: boolean }>(
      `SELECT afgevinkt FROM pack_item WHERE trip_id = $1`,
      [id],
    );
    const lijsten = await queryOne<{ aantal: number }>(
      `SELECT count(*)::int AS aantal FROM pack_list WHERE trip_id = $1`,
      [id],
    );

    const etappes = await queryOne<{ aantal: number }>(
      `SELECT count(*)::int AS aantal FROM stop WHERE trip_id = $1`,
      [id],
    );
    const noodnummers = await queryOne<{ aantal: number }>(
      `SELECT count(*)::int AS aantal FROM contact WHERE trip_id = $1`,
      [id],
    );

    return {
      trip: toTrip(trip),
      documenten: {
        totaal: documenten.rows.length,
        ontbreekt: statussen.filter((status) => status === "ontbreekt").length,
        letOp: statussen.filter((status) => status === "let op").length,
        geldig: statussen.filter((status) => status === "geldig").length,
      },
      inpaklijsten: { ...voortgang(pakItems.rows), lijsten: lijsten?.aantal ?? 0 },
      onderweg: {
        etappes: etappes?.aantal ?? 0,
        noodnummers: noodnummers?.aantal ?? 0,
      },
    };
  });

  // --- Reizigers ----------------------------------------------------------

  app.get("/trips/:tripId/travelers", async (request) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const result = await query<TravelerRow>(
      `SELECT id, trip_id, naam, geboortejaar FROM traveler
       WHERE trip_id = $1 ORDER BY created_at ASC`,
      [tripId],
    );
    return result.rows.map(toTraveler);
  });

  app.post("/trips/:tripId/travelers", async (request, reply) => {
    const tripId = pathUuid((request.params as { tripId?: string }).tripId, "tripId");
    await haalTrip(tripId);
    const fields = new Fields(request.body);
    const row = await queryOne<TravelerRow>(
      `INSERT INTO traveler (trip_id, naam, geboortejaar) VALUES ($1, $2, $3)
       RETURNING id, trip_id, naam, geboortejaar`,
      [
        tripId,
        fields.text("naam", { max: 80 }),
        fields.optionalNumber("geboortejaar", { min: 1900, max: 2200 }),
      ],
    );
    reply.code(201);
    return toTraveler(row!);
  });

  app.patch("/travelers/:id", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const fields = new Fields(request.body);
    const bestaand = await queryOne<TravelerRow>(
      `SELECT id, trip_id, naam, geboortejaar FROM traveler WHERE id = $1`,
      [id],
    );
    if (!bestaand) throw new NotFoundError("Deze reiziger bestaat niet");

    const naam = fields.has("naam") ? fields.text("naam", { max: 80 }) : bestaand.naam;
    const geboortejaar = fields.has("geboortejaar")
      ? fields.optionalNumber("geboortejaar", { min: 1900, max: 2200 })
      : bestaand.geboortejaar;

    const row = await queryOne<TravelerRow>(
      `UPDATE traveler SET naam = $2, geboortejaar = $3 WHERE id = $1
       RETURNING id, trip_id, naam, geboortejaar`,
      [id, naam, geboortejaar],
    );
    return toTraveler(row!);
  });

  /**
   * Verwijdert een reiziger. Documenten die aan deze reiziger hingen gaan via
   * cascade mee, net als inpaklijsten die bij deze reiziger horen (en de
   * items daarin, via een tweede cascade); de bestanden op schijf halen we
   * hier weg.
   */
  app.delete("/travelers/:id", async (request, reply) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const bestaand = await queryOne<{ trip_id: string }>(
      `SELECT trip_id FROM traveler WHERE id = $1`,
      [id],
    );
    if (!bestaand) throw new NotFoundError("Deze reiziger bestaat niet");

    const bestanden = await query<{ bestandspad: string }>(
      `SELECT bestandspad FROM document WHERE traveler_id = $1 AND bestandspad IS NOT NULL`,
      [id],
    );
    await query(`DELETE FROM traveler WHERE id = $1`, [id]);

    for (const bestand of bestanden.rows) {
      await verwijderBestand(bestand.bestandspad);
    }
    reply.code(204);
    return null;
  });
};

function voortgang(items: { afgevinkt: boolean }[]) {
  const totaal = items.length;
  const afgevinkt = items.filter((item) => item.afgevinkt).length;
  return {
    totaal,
    afgevinkt,
    percentage: totaal === 0 ? 0 : Math.round((afgevinkt / totaal) * 100),
  };
}

function leesTripVelden(fields: Fields) {
  const vertrekdatum = fields.date("vertrekdatum");
  const terugdatum = fields.date("terugdatum");
  if (terugdatum < vertrekdatum) {
    throw new ValidationError("De terugdatum kan niet voor de vertrekdatum liggen");
  }
  const thuisCoord = leesCoordinaatPaar(fields, "thuisLat", "thuisLon");
  const bestemmingCoord = leesCoordinaatPaar(fields, "bestemmingLat", "bestemmingLon");
  return {
    naam: fields.text("naam", { max: 120 }),
    bestemming: fields.text("bestemming", { max: 120 }),
    land: fields.text("land", { max: 120 }),
    regio: fields.optionalText("regio", { max: 120 }),
    vertrekdatum,
    terugdatum,
    campingNaam: fields.optionalText("campingNaam", { max: 160 }),
    plaatsnummer: fields.optionalText("plaatsnummer", { max: 40 }),
    plaatsInfo: fields.optionalText("plaatsInfo", { max: 1000 }),
    afstandKm: fields.optionalNumber("afstandKm", { max: 30_000 }),
    rijtijdMin: fields.optionalNumber("rijtijdMin", { max: 100_000 }),
    tolKosten: fields.optionalNumber("tolKosten", { max: 10_000 }),
    thuisplaats: fields.optionalText("thuisplaats", { max: 160 }),
    thuisland: fields.optionalText("thuisland", { max: 120 }),
    // Preciezer adres, gekozen via de autocomplete. Komt er geen coördinaat
    // mee, dan is er niets geverifieerd en zoekt de app later de stad zelf op
    // — precies zoals wanneer deze velden helemaal niet zijn ingevuld.
    thuisAdres: fields.optionalText("thuisAdres", { max: 300 }),
    thuisLat: thuisCoord.lat,
    thuisLon: thuisCoord.lon,
    bestemmingAdres: fields.optionalText("bestemmingAdres", { max: 300 }),
    bestemmingLat: bestemmingCoord.lat,
    bestemmingLon: bestemmingCoord.lon,
  };
}
