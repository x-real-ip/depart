import { useEffect, useState } from "react";
import { Bestemmingen } from "../components/Bestemmingen.tsx";
import { Landkaart } from "../components/Landkaart.tsx";
import { Noodnummers } from "../components/Noodnummers.tsx";
import { RitKaart, RouteEtappes } from "../components/RitKaart.tsx";
import { VerkeerKaart } from "../components/VerkeerKaart.tsx";
import { VerplichtInDeAuto } from "../components/VerplichtInDeAuto.tsx";
import { Kaart, KaartKop, Melding } from "../components/ui.tsx";
import {
  api,
  type Destination,
  type RouteAntwoord,
  type TolAntwoord,
  type Trip,
  type VerkeerAntwoord,
} from "../lib/api.ts";

/**
 * De rit van thuis naar de eindbestemming: afstand/rijtijd/tol, de etappes,
 * de kaart, de bestemmingen zelf (hier ook te beheren — precies waar je
 * onderweg een extra stop bedenkt), wat verplicht is in de auto, actuele
 * verkeersinformatie en de noodnummers.
 */
export function Heenreis({ trip, onTripGewijzigd }: { trip: Trip; onTripGewijzigd: () => void }) {
  const [bestemmingen, setBestemmingen] = useState<Destination[] | null>(null);
  const [route, setRoute] = useState<RouteAntwoord | null>(null);
  const [tol, setTol] = useState<TolAntwoord | null>(null);
  const [verkeer, setVerkeer] = useState<VerkeerAntwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    let actueel = true;
    api.destinations
      .lijst(trip.id)
      .then((resultaat) => {
        if (actueel) setBestemmingen(resultaat);
      })
      .catch((error: Error) => {
        if (actueel) setFout(error.message);
      });
    return () => {
      actueel = false;
    };
  }, [trip.id]);

  useEffect(() => {
    let actueel = true;
    void api.reisinfo.route(trip.id).then((antwoord) => {
      if (actueel) setRoute(antwoord);
    });
    return () => {
      actueel = false;
    };
  }, [trip.id]);

  useEffect(() => {
    let actueel = true;
    setTol(null);
    void api.reisinfo.tol(trip.id).then((antwoord) => {
      if (actueel) setTol(antwoord);
    });
    return () => {
      actueel = false;
    };
  }, [trip.id]);

  useEffect(() => {
    let actueel = true;
    setVerkeer(null);

    async function ververs(): Promise<void> {
      const antwoord = await api.reisinfo.verkeer(trip.id);
      if (actueel) setVerkeer(antwoord);
    }

    void ververs();
    // Elke vijf minuten opnieuw ophalen — precies vaak genoeg om onderweg
    // actueel te blijven. De backend bepaalt zelf hoe vers het antwoord is.
    const interval = window.setInterval(() => void ververs(), 5 * 60_000);

    return () => {
      actueel = false;
      window.clearInterval(interval);
    };
  }, [trip.id]);

  // Stille achtervang: zodra de berekende route klaar is en afwijkt van wat
  // er in de reis staat, wordt die meteen overgenomen — zonder knop. Zo
  // heeft het overzicht altijd iets bruikbaars, ook wanneer de berekening
  // een keer niet lukt (geen internet, dienst uitgeschakeld).
  useEffect(() => {
    if (route?.route == null) return;
    if (
      route.route.totaalAfstandKm === trip.afstandKm &&
      route.route.totaalRijtijdMin === trip.rijtijdMin
    ) {
      return;
    }
    void api.reisinfo.routeOvernemen(trip.id).then((resultaat) => {
      if (resultaat.overgenomen) onTripGewijzigd();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, trip.id, trip.afstandKm, trip.rijtijdMin]);

  // Zelfde soort achtervang voor de tolschatting.
  useEffect(() => {
    if (tol?.schatting == null) return;
    const afgerond = Math.round(tol.schatting.totaalEUR);
    if (afgerond === trip.tolKosten) return;
    void api.trips.werkBij(trip.id, { tolKosten: afgerond }).then(() => onTripGewijzigd());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tol, trip.id, trip.tolKosten]);

  /**
   * Na een wijziging in de bestemmingenlijst de route herberekenen én onze
   * eigen kopie van de lijst verversen — die gebruiken we hier alleen om de
   * landen te bepalen voor "Verplicht in de auto".
   */
  async function herlaadNaWijziging(): Promise<void> {
    const [nieuweRoute, nieuweBestemmingen, nieuweTol] = await Promise.all([
      api.reisinfo.route(trip.id),
      api.destinations.lijst(trip.id),
      api.reisinfo.tol(trip.id),
    ]);
    setRoute(nieuweRoute);
    setBestemmingen(nieuweBestemmingen);
    setTol(nieuweTol);
  }

  if (fout !== null && bestemmingen === null) return <Melding tekst={fout} />;
  if (bestemmingen === null) return null;

  // Landen waar je doorheen rijdt of verblijft, op volgorde van de eerste
  // bestemming waar dat land bij hoort — een reis kan door meerdere landen gaan.
  const landen = [
    ...new Set(bestemmingen.map((b) => b.land).filter((land): land is string => land !== null)),
  ];

  return (
    <div className="space-y-4">
      {fout !== null && <Melding tekst={fout} onSluit={() => setFout(null)} />}

      <RitKaart
        titel="De rit"
        route={route}
        tol={tol}
        afstandFallback={trip.afstandKm}
        rijtijdFallback={trip.rijtijdMin}
        tolFallback={trip.tolKosten}
      />

      <RouteEtappes route={route} />

      {route !== null && route.punten.length > 0 && (
        <Kaart>
          <KaartKop>Kaart</KaartKop>
          <Landkaart punten={route.punten} geometrie={route.route?.geometrie} />
        </Kaart>
      )}

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
        {/* Bestemmingen: dezelfde lijst als bij de instellingen, hier ook te
            beheren — precies waar je onderweg een extra stop bedenkt. */}
        <Bestemmingen tripId={trip.id} onGewijzigd={() => void herlaadNaWijziging()} />

        <div className="space-y-4">
          <VerplichtInDeAuto landen={landen} />
          <Noodnummers tripId={trip.id} landen={landen} />
        </div>
      </div>

      <VerkeerKaart gegevens={verkeer} />
    </div>
  );
}
