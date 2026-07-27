import type { FastifyPluginAsync } from "fastify";
import { config } from "../config.js";
import { query } from "../db.js";
import {
  haalRoute,
  haalWeer,
  zoekCoordinaat,
  type Coordinaat,
  type CoordinaatUitkomst,
  type RouteInfo,
  type WeerReeks,
} from "../extern.js";
import type { DestinationRow, TripRow } from "../types.js";
import { pathUuid } from "../validate.js";
import { haalTrip } from "./trips.js";

/**
 * Actuele reisinformatie: het weer op de eindbestemming en thuis, en de route
 * van huis via alle bestemmingen naar de eindbestemming (de laatste in de
 * volgorde).
 *
 * Beide endpoints geven altijd een antwoord, ook als een externe dienst het
 * niet doet. Dan staat er in het antwoord waarom er geen gegevens zijn, en
 * blijft de app werken.
 */

type Reden =
  | "ok"
  | "uitgeschakeld"
  | "geen-thuisplaats"
  | "geen-bestemming"
  | "plaats-niet-gevonden"
  | "dienst-onbereikbaar"
  | "te-weinig-punten";

/** Eén punt op de kaart: waar het voor staat, plus de coördinaat. */
interface RoutePunt {
  naam: string;
  rol: "thuis" | "onderweg" | "bestemming";
  lat: number;
  lon: number;
}

/** Geeft elk punt zijn rol: eerste is thuis, laatste bestemming, rest onderweg. */
function metRol(punten: { naam: string; coordinaat: Coordinaat }[]): RoutePunt[] {
  return punten.map((punt, index) => ({
    naam: punt.naam,
    rol: index === 0 ? "thuis" : index === punten.length - 1 ? "bestemming" : "onderweg",
    lat: punt.coordinaat.lat,
    lon: punt.coordinaat.lon,
  }));
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
 * Coördinaat van een bestemming. Het adres gaat mee in de zoekopdracht als
 * dat ingevuld is; dan komt een camping of hotel nauwkeuriger uit dan de
 * plaatsnaam alleen.
 */
async function coordinaatVanBestemming(destination: DestinationRow): Promise<Coordinaat | null> {
  if (destination.lat !== null && destination.lon !== null) {
    return { lat: destination.lat, lon: destination.lon };
  }
  const zoekterm =
    destination.adres === null ? destination.plaats : `${destination.adres}, ${destination.plaats}`;
  let uitkomst = await zoekCoordinaat(zoekterm, destination.land);
  // Levert het volledige adres niets op, dan is de plaatsnaam nog altijd beter
  // dan een gat in de route.
  if ("fout" in uitkomst && uitkomst.fout === "niet-gevonden" && destination.adres !== null) {
    uitkomst = await zoekCoordinaat(destination.plaats, destination.land);
  }
  if ("fout" in uitkomst) return null;
  await query(`UPDATE destination SET lat = $2, lon = $3 WHERE id = $1`, [
    destination.id,
    uitkomst.coordinaat.lat,
    uitkomst.coordinaat.lon,
  ]);
  return uitkomst.coordinaat;
}

async function haalBestemmingen(tripId: string): Promise<DestinationRow[]> {
  const result = await query<DestinationRow>(
    `SELECT id, trip_id, naam, plaats, land, regio, adres, plaatsnummer, opmerking,
            incheckdatum, inchecktijd, uitcheckdatum, uitchecktijd, volgorde, lat, lon
     FROM destination
     WHERE trip_id = $1
     ORDER BY volgorde ASC, created_at ASC`,
    [tripId],
  );
  return result.rows;
}

/**
 * Bouwt de punten van de route: thuis, dan elke bestemming in volgorde. De
 * laatste bestemming is de eindbestemming van de reis. Een bestemming waarvan
 * het adres niet te vinden is, wordt overgeslagen in plaats van de hele route
 * te laten mislukken.
 */
async function routePunten(
  trip: TripRow,
): Promise<{ punten: { naam: string; coordinaat: Coordinaat }[] } | { fout: Reden }> {
  if (!config.extern.enabled) return { fout: "uitgeschakeld" };
  if (trip.thuisplaats === null) return { fout: "geen-thuisplaats" };

  const bestemmingen = await haalBestemmingen(trip.id);
  if (bestemmingen.length === 0) return { fout: "geen-bestemming" };

  const thuis = await coordinaatVanThuis(trip);
  if ("fout" in thuis && thuis.fout === "onbereikbaar") return { fout: "dienst-onbereikbaar" };
  if ("fout" in thuis) return { fout: redenVan(thuis) };

  const punten: { naam: string; coordinaat: Coordinaat }[] = [
    { naam: trip.thuisplaats, coordinaat: thuis.coordinaat },
  ];
  for (const destination of bestemmingen) {
    const coordinaat = await coordinaatVanBestemming(destination);
    if (coordinaat !== null) {
      punten.push({ naam: destination.naam ?? destination.plaats, coordinaat });
    }
  }
  // Alle bestemmingen waren onvindbaar: dan is er geen route te tekenen,
  // alleen het vertrekpunt.
  if (punten.length < 2) return { fout: "plaats-niet-gevonden" };

  return { punten };
}

export const reisinfoRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Weersverwachting voor de eindbestemming en voor thuis, voor de dagen van
   * het verblijf. Ligt de reis verder weg dan de verwachting reikt (zestien
   * dagen), dan staat `dektVerblijf` op false en gaat het om de komende week.
   */
  app.get("/trips/:id/weer", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const trip = await haalTrip(id);

    if (!config.extern.enabled) {
      return {
        bestemming: null,
        thuis: null,
        bestemmingReden: "uitgeschakeld" satisfies Reden,
        thuisReden: "uitgeschakeld" satisfies Reden,
        reden: "uitgeschakeld" satisfies Reden,
      };
    }

    const bestemmingen = await haalBestemmingen(id);
    const eindbestemming = bestemmingen.at(-1) ?? null;

    const [bestemmingCoord, thuisUitkomst] = await Promise.all([
      eindbestemming === null
        ? Promise.resolve(null)
        : await coordinaatVanBestemming(eindbestemming),
      coordinaatVanThuis(trip),
    ]);

    const [bestemming, thuis] = await Promise.all([
      bestemmingCoord === null || eindbestemming === null
        ? Promise.resolve(null)
        : // Het weer gaat over de stad, niet over de accommodatie — dus de
          // plaatsnaam, ook als er een specifiekere naam bekend is.
          haalWeer(eindbestemming.plaats, bestemmingCoord, trip.vertrekdatum, trip.terugdatum),
      "fout" in thuisUitkomst || trip.thuisplaats === null
        ? Promise.resolve(null)
        : haalWeer(trip.thuisplaats, thuisUitkomst.coordinaat, trip.vertrekdatum, trip.terugdatum),
    ]);

    const bestemmingReden: Reden =
      bestemming !== null
        ? "ok"
        : eindbestemming === null
          ? "geen-bestemming"
          : bestemmingCoord === null
            ? "plaats-niet-gevonden"
            : "dienst-onbereikbaar";

    return {
      bestemming,
      thuis,
      // Een reden per plaats: het weer thuis kan lukken terwijl de bestemming
      // mislukt. Zonder dit onderscheid ziet de gebruiker één kolom en hoort hij
      // niet waarom de andere ontbreekt.
      bestemmingReden,
      thuisReden:
        trip.thuisplaats === null
          ? ("geen-thuisplaats" satisfies Reden)
          : perPlaatsReden(thuisUitkomst, thuis),
      reden: bestemming !== null || thuis !== null ? "ok" : bestemmingReden,
    };
  });

  /**
   * De route van huis, via alle bestemmingen in volgorde, naar de
   * eindbestemming (de laatste in die volgorde).
   */
  app.get("/trips/:id/route", async (request) => {
    const id = pathUuid((request.params as { id?: string }).id);
    const trip = await haalTrip(id);

    const leeg = (waarom: Reden) => ({
      route: null as RouteInfo | null,
      reden: waarom,
      punten: [] as RoutePunt[],
    });

    const opbouw = await routePunten(trip);
    if ("fout" in opbouw) return leeg(opbouw.fout);

    // De punten (voor de kaart) staan vast zodra de coördinaten bekend zijn,
    // ook als OSRM zelf niet antwoordt — dan zie je de plekken zonder lijn
    // ertussen, in plaats van een lege kaart.
    const punten = metRol(opbouw.punten);
    const route = await haalRoute(opbouw.punten);
    if (route === null) return { route: null, reden: "dienst-onbereikbaar" satisfies Reden, punten };

    return {
      route,
      reden: "ok" satisfies Reden,
      /** Aantal tussenliggende bestemmingen (niet de eerste of de laatste). */
      onderweg: opbouw.punten.length - 2,
      punten,
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

    const bijgewerkt = await query<{ afstand_km: number; rijtijd_min: number }>(
      `UPDATE trip SET afstand_km = $2, rijtijd_min = $3 WHERE id = $1
       RETURNING afstand_km, rijtijd_min`,
      [id, route.totaalAfstandKm, route.totaalRijtijdMin],
    );

    return {
      overgenomen: true,
      reden: "ok" satisfies Reden,
      afstandKm: bijgewerkt.rows[0]?.afstand_km ?? null,
      rijtijdMin: bijgewerkt.rows[0]?.rijtijd_min ?? null,
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
