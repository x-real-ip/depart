import type { FastifyPluginAsync } from "fastify";
import { config } from "../config.js";
import { query, queryOne } from "../db.js";
import {
  haalRoute,
  haalWeer,
  zoekCoordinaat,
  type Coordinaat,
  type CoordinaatUitkomst,
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
async function coordinaatVanBestemming(trip: TripRow): Promise<CoordinaatUitkomst> {
  if (trip.bestemming_lat !== null && trip.bestemming_lon !== null) {
    return { coordinaat: { lat: trip.bestemming_lat, lon: trip.bestemming_lon } };
  }
  const uitkomst = await zoekCoordinaat(trip.bestemming, trip.land);
  if ("fout" in uitkomst) return uitkomst;
  await query(`UPDATE trip SET bestemming_lat = $2, bestemming_lon = $3 WHERE id = $1`, [
    trip.id,
    uitkomst.coordinaat.lat,
    uitkomst.coordinaat.lon,
  ]);
  return uitkomst;
}

async function coordinaatVanThuis(trip: TripRow): Promise<CoordinaatUitkomst> {
  if (trip.thuisplaats === null) return { fout: "niet-gevonden" };
  if (trip.thuis_lat !== null && trip.thuis_lon !== null) {
    return { coordinaat: { lat: trip.thuis_lat, lon: trip.thuis_lon } };
  }
  const uitkomst = await zoekCoordinaat(trip.thuisplaats, trip.thuisland);
  if ("fout" in uitkomst) return uitkomst;
  await query(`UPDATE trip SET thuis_lat = $2, thuis_lon = $3 WHERE id = $1`, [
    trip.id,
    uitkomst.coordinaat.lat,
    uitkomst.coordinaat.lon,
  ]);
  return uitkomst;
}

/** Een mislukte coördinaat naar de reden die de app aan de gebruiker toont. */
function redenVan(uitkomst: { fout: "niet-gevonden" | "onbereikbaar" }): Reden {
  return uitkomst.fout === "onbereikbaar" ? "dienst-onbereikbaar" : "plaats-niet-gevonden";
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
  let uitkomst = await zoekCoordinaat(zoekterm, land);
  // Levert het volledige adres niets op, dan is de plaatsnaam nog altijd beter
  // dan een gat in de route.
  if ("fout" in uitkomst && uitkomst.fout === "niet-gevonden" && stop.adres !== null) {
    uitkomst = await zoekCoordinaat(stop.plaats, land);
  }
  if ("fout" in uitkomst) return null;
  await query(`UPDATE stop SET lat = $2, lon = $3 WHERE id = $1`, [
    stop.id,
    uitkomst.coordinaat.lat,
    uitkomst.coordinaat.lon,
  ]);
  return uitkomst.coordinaat;
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

  const [thuis, bestemming] = await Promise.all([
    coordinaatVanThuis(trip),
    coordinaatVanBestemming(trip),
  ]);
  // Een onbereikbare dienst weegt zwaarder dan een onbekende plaatsnaam: bij het
  // eerste kan de gebruiker niets doen, bij het tweede wel.
  if ("fout" in thuis && thuis.fout === "onbereikbaar") return { fout: "dienst-onbereikbaar" };
  if ("fout" in bestemming && bestemming.fout === "onbereikbaar") {
    return { fout: "dienst-onbereikbaar" };
  }
  if ("fout" in thuis) return { fout: redenVan(thuis) };
  if ("fout" in bestemming) return { fout: redenVan(bestemming) };
  const thuisCoord = thuis.coordinaat;
  const bestemmingCoord = bestemming.coordinaat;

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

    const [bestemmingUitkomst, thuisUitkomst] = await Promise.all([
      coordinaatVanBestemming(trip),
      coordinaatVanThuis(trip),
    ]);

    const [bestemming, thuis] = await Promise.all([
      "fout" in bestemmingUitkomst
        ? Promise.resolve(null)
        : haalWeer(
            trip.bestemming,
            bestemmingUitkomst.coordinaat,
            trip.vertrekdatum,
            trip.terugdatum,
          ),
      "fout" in thuisUitkomst || trip.thuisplaats === null
        ? Promise.resolve(null)
        : haalWeer(trip.thuisplaats, thuisUitkomst.coordinaat, trip.vertrekdatum, trip.terugdatum),
    ]);

    return {
      bestemming,
      thuis,
      // Een reden per plaats: het weer thuis kan lukken terwijl de bestemming
      // mislukt. Zonder dit onderscheid ziet de gebruiker één kolom en hoort hij
      // niet waarom de andere ontbreekt.
      bestemmingReden: perPlaatsReden(bestemmingUitkomst, bestemming),
      thuisReden:
        trip.thuisplaats === null
          ? ("geen-thuisplaats" satisfies Reden)
          : perPlaatsReden(thuisUitkomst, thuis),
      reden: weerReden(trip, bestemmingUitkomst, bestemming, thuis),
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

/** Waarom deze ene plaats wel of geen reeks opleverde. */
function perPlaatsReden(uitkomst: CoordinaatUitkomst, reeks: WeerReeks | null): Reden {
  if (reeks !== null) return "ok";
  if ("fout" in uitkomst) return redenVan(uitkomst);
  // De coördinaat was er wel, dus het is de weerdienst die niet antwoordde.
  return "dienst-onbereikbaar";
}

/**
 * Waarom er in het geheel geen weergegevens zijn. Eén reeks is genoeg om "ok"
 * te zijn: het weer op de bestemming is bruikbaar ook als de thuisplaats nog
 * leeg is.
 */
function weerReden(
  trip: TripRow,
  bestemmingUitkomst: CoordinaatUitkomst,
  bestemming: WeerReeks | null,
  thuis: WeerReeks | null,
): Reden {
  if (bestemming !== null || thuis !== null) return "ok";
  if ("fout" in bestemmingUitkomst) return redenVan(bestemmingUitkomst);
  if (trip.thuisplaats === null) return "geen-thuisplaats";
  // De coördinaten waren er wel, dus het is de weerdienst die niet antwoordde.
  return "dienst-onbereikbaar";
}
