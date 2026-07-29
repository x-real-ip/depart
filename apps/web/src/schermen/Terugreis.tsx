import { useEffect, useState } from "react";
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
 * De rit terug: dezelfde bestemmingen als de heenreis, maar omgedraaid — van
 * de eindbestemming naar huis. Geen apart in te vullen tussenstops voor de
 * terugweg; de app berekent er een eigen route, verkeersinformatie en
 * tolschatting voor, want die kunnen anders uitvallen dan op de heenreis
 * (bijvoorbeeld door eenrichtingsverkeer).
 */
export function Terugreis({ trip }: { trip: Trip }) {
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
    void api.reisinfo.terugreisRoute(trip.id).then((antwoord) => {
      if (actueel) setRoute(antwoord);
    });
    return () => {
      actueel = false;
    };
  }, [trip.id]);

  useEffect(() => {
    let actueel = true;
    setTol(null);
    void api.reisinfo.terugreisTol(trip.id).then((antwoord) => {
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
      const antwoord = await api.reisinfo.terugreisVerkeer(trip.id);
      if (actueel) setVerkeer(antwoord);
    }

    void ververs();
    const interval = window.setInterval(() => void ververs(), 5 * 60_000);

    return () => {
      actueel = false;
      window.clearInterval(interval);
    };
  }, [trip.id]);

  if (fout !== null && bestemmingen === null) return <Melding tekst={fout} />;
  if (bestemmingen === null) return null;

  const landen = [
    ...new Set(bestemmingen.map((b) => b.land).filter((land): land is string => land !== null)),
  ];

  return (
    <div className="space-y-4">
      {fout !== null && <Melding tekst={fout} onSluit={() => setFout(null)} />}

      {/* Geen achtervangwaarden: de terugreis heeft geen eigen opgeslagen
          afstand/rijtijd/tol zoals de heenreis — alleen de live berekening. */}
      <RitKaart
        titel="De terugrit"
        route={route}
        tol={tol}
        afstandFallback={null}
        rijtijdFallback={null}
        tolFallback={null}
      />

      <RouteEtappes route={route} />

      {route !== null && route.punten.length > 0 && (
        <Kaart>
          <KaartKop>Kaart</KaartKop>
          <Landkaart punten={route.punten} geometrie={route.route?.geometrie} />
        </Kaart>
      )}

      <VerplichtInDeAuto landen={landen} />
      <Noodnummers tripId={trip.id} landen={landen} />
      <VerkeerKaart gegevens={verkeer} />
    </div>
  );
}
