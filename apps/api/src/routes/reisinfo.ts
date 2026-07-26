import type { FastifyPluginAsync } from "fastify";
import { config } from "../config.js";
import { query, queryOne } from "../db.js";
import {
  haalRoute,
  haalWeer,
  zoekCoordinaat,
  type Coordinaat,
  type RouteInfo,
  type WeerReeks,
} from "../extern.js";
import type { StopRow, TripRow } from "../types.js";
import { pathUuid } from "../validate.js";
import { haalTrip } from "./trips.js";

/**
 * Actuele reisinformatie: het weer op de bestemming en thuis, en de route van
 * huis via de overnachtingen naar de eindbestemming.
 *
 * Beide endpoints geven altijd een antwoord, ook als een externe dienst het
 * niet doet. Dan staat er in het antwoord waarom er geen gegevens zijn, en
 * blijft de app werken.
 */

type Reden =
  | "ok"
  | "uitgeschakeld"
  | "geen-thuisplaats"
  | "plaats-niet-gevonden"
  | "dienst-onbereikbaar"
  | "te-weinig-punten";

/**
 * Zoekt de coördinaten van de bestemming op en bewaart ze bij de reis, zodat
 * de geocoder niet bij elke aanvraag nodig is.
 */
async function coordinaatVanBestemming(trip: TripRow): Promise<Coordinaat | null> {
  if (trip.bestemming_lat !== null && trip.bestemming_lon !== null) {
    return { lat: trip.bestemming_lat, lon: trip.bestemming_lon };
  }
  const gevonden = await zoekCoordinaat(trip.bestemming, trip.land);
  if (gevonden === null) return null;
  await query(`UPDATE trip SET bestemming_lat = $2, bestemming_lon = $3 WHERE id = $1`, [
    trip.id,
    gevonden.lat,
    gevonden.lon,
  ]);
  return gevonden;
}

async function coordinaatVanThuis(trip: TripRow): Promise<Coordinaat | null> {
  if (trip.thuisplaats === null) return null;
  if (trip.thuis_lat !== null && trip.thuis_lon !== null) {
    return { lat: trip.thuis_lat, lon: trip.thuis_lon };
  }
  const gevonden = await zoekCoordinaat(trip.thuisplaats, trip.thuisland);
  if (gevonden === null) return null;
  await query(`UPDATE trip SET thuis_lat = $2, thuis_lon = $3 WHERE id = $1`, [
    trip.id,
    gevonden.lat,
    gevonden.lon,
  ]);
  return gevonden;
}

/**
 * Coördinaat van een etappe. Het adres gaat mee in de zoekopdracht als dat
 * ingevuld is; dan komt een camping of hotel nauwkeuriger uit dan de plaatsnaam
 * alleen.
 */
async function coordinaatVanEtappe(stop: StopRow, land: string | null): Promise<Coordinaat | null> {
  if (stop.lat !== null && stop.lon !== null) {
    return { lat: stop.lat, lon: stop.lon };
  }
  const zoekterm = stop.adres === null ? stop.plaats : `${stop.adres}, ${stop.plaats}`;
  let gevonden = await zoekCoordinaat(zoekterm, land);
  // Levert het volledige adres niets op, dan is de plaatsnaam nog altijd beter
  // dan een gat in de route.
  if (gevonden === null && stop.adres !== null) {
    gevonden = await zoekCoordinaat(stop.plaats, land);
  }
  if (gevonden === null) return null;
  await query(`UPDATE stop SET lat = $2, lon = $3 WHERE id = $1`, [
    stop.id,
    gevonden.lat,
    gevonden.lon,
  ]);
  return gevonden;
}

/**
 * Bouwt de punten van de route: thuis, dan elke overnachting in volgorde, dan
 * de eindbestemming. Een overnachting waarvan het adres niet te vinden is,
 * wordt overgeslagen in plaats van de hele route te laten mislukken.
 */
async function routePunten(
  trip: TripRow,
): Promise<{ punten: { naam: string; coordinaat: Coordinaat }[] } | { fout: Reden }> {
  if (!config.extern.enabled) return { fout: "uitgeschakeld" };
  if (trip.thuisplaats === null) return { fout: "geen-thuisplaats" };

  const [thuisCoord, bestemmingCoord] = await Promise.all([
    coordinaatVanThuis(trip),
    coordinaatVanBestemming(trip),
  ]);
  if (thuisCoord === null || bestemmingCoord === null) return { fout: "plaats-niet-gevonden" };

  const overnachtingen = await query<StopRow>(
    `SELECT id, trip_id, plaats, tijd, opmerking, volgorde, overnachting, adres, nachten, lat, lon
     FROM stop
     WHERE trip_id = $1 AND overnachting = true
     ORDER BY volgorde ASC, created_at ASC`,
    [trip.id],
  );

  const punten: { naam: string; coordinaat: Coordinaat }[] = [
    { naam: trip.thuisplaats, coordinaat: thuisCoord },
  ];
  for (const stop of overnachtingen.rows) {
    const coordinaat = await coordinaatVanEtappe(stop, trip.land);
    if (coordinaat !== null) punten.push({ naam: stop.plaats, coordinaat });
  }
  punten.push({ naam: trip.bestemming, coordinaat: bestemmingCoord });

  return { punten };
}

export const reisinfoRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Weersverwachting voor de bestemming en voor thuis, voor de dagen van het
   * verblijf. Ligt de reis verder weg dan de verwachting reikt (zestien dagen),
   * dan staat `dektVerblijf` op false en gaat het om de komende week.
   */
  app.get("/trips/:id/weer", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const trip = await haalTrip(id);

    if (!config.extern.enabled) {
      return { bestemming: null, thuis: null, reden: "uitgeschakeld" satisfies Reden };
    }

    const [bestemmingCoord, thuisCoord] = await Promise.all([
      coordinaatVanBestemming(trip),
      coordinaatVanThuis(trip),
    ]);

    const [bestemming, thuis] = await Promise.all([
      bestemmingCoord === null
        ? Promise.resolve(null)
        : haalWeer(trip.bestemming, bestemmingCoord, trip.vertrekdatum, trip.terugdatum),
      thuisCoord === null || trip.thuisplaats === null
        ? Promise.resolve(null)
        : haalWeer(trip.thuisplaats, thuisCoord, trip.vertrekdatum, trip.terugdatum),
    ]);

    return {
      bestemming,
      thuis,
      reden: reden(bestemming, thuis, trip.thuisplaats !== null, bestemmingCoord !== null),
    };
  });

  /**
   * De route van huis, via de overnachtingen in volgorde, naar de
   * eindbestemming. Tussenstops zonder overnachting doen niet mee: die liggen
   * op de route en zouden de etappes onnodig opdelen.
   */
  app.get("/trips/:id/route", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const trip = await haalTrip(id);

    const leeg = (waarom: Reden) => ({ route: null as RouteInfo | null, reden: waarom });

    const opbouw = await routePunten(trip);
    if ("fout" in opbouw) return leeg(opbouw.fout);

    const route = await haalRoute(opbouw.punten);
    if (route === null) return leeg("dienst-onbereikbaar");

    return {
      route,
      reden: "ok" satisfies Reden,
      /** Aantal overnachtingen dat in de route is meegenomen. */
      overnachtingen: opbouw.punten.length - 2,
    };
  });

  /**
   * Neemt de berekende afstand en rijtijd over in de reis, zodat het overzicht
   * dezelfde getallen laat zien. Bewust een aparte handeling: de app overschrijft
   * niet ongevraagd wat je zelf hebt ingevuld.
   */
  app.post("/trips/:id/route/overnemen", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const trip = await haalTrip(id);

    const opbouw = await routePunten(trip);
    if ("fout" in opbouw) return { overgenomen: false, reden: opbouw.fout };

    const route = await haalRoute(opbouw.punten);
    if (route === null) {
      return { overgenomen: false, reden: "dienst-onbereikbaar" satisfies Reden };
    }

    const bijgewerkt = await queryOne<{ afstand_km: number; rijtijd_min: number }>(
      `UPDATE trip SET afstand_km = $2, rijtijd_min = $3 WHERE id = $1
       RETURNING afstand_km, rijtijd_min`,
      [id, route.totaalAfstandKm, route.totaalRijtijdMin],
    );

    return {
      overgenomen: true,
      reden: "ok" satisfies Reden,
      afstandKm: bijgewerkt?.afstand_km ?? null,
      rijtijdMin: bijgewerkt?.rijtijd_min ?? null,
    };
  });
};

function reden(
  bestemming: WeerReeks | null,
  thuis: WeerReeks | null,
  heeftThuisplaats: boolean,
  bestemmingGevonden: boolean,
): Reden {
  if (bestemming !== null || thuis !== null) return "ok";
  if (!bestemmingGevonden) return "plaats-niet-gevonden";
  if (!heeftThuisplaats) return "geen-thuisplaats";
  return "dienst-onbereikbaar";
}
