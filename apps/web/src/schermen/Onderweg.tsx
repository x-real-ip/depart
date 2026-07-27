import { useEffect, useState } from "react";
import { Bestemmingen } from "../components/Bestemmingen.tsx";
import { Landkaart } from "../components/Landkaart.tsx";
import {
  INVOER_STIJL,
  Kaart,
  KaartKop,
  Knop,
  Laden,
  LegeStaat,
  Melding,
  Veld,
} from "../components/ui.tsx";
import {
  REDEN_TEKST,
  api,
  type Contact,
  type Destination,
  type RouteAntwoord,
  type Trip,
} from "../lib/api.ts";
import { afstand, bedrag, officieleNoodnummers, rijtijd, verplichtInDeAuto } from "../lib/format.ts";

export function Onderweg({ trip, onTripGewijzigd }: { trip: Trip; onTripGewijzigd: () => void }) {
  const [bestemmingen, setBestemmingen] = useState<Destination[] | null>(null);
  const [nummers, setNummers] = useState<Contact[] | null>(null);
  const [route, setRoute] = useState<RouteAntwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const [nieuwLabel, setNieuwLabel] = useState("");
  const [nieuwNummer, setNieuwNummer] = useState("");

  useEffect(() => {
    let actueel = true;
    Promise.all([api.destinations.lijst(trip.id), api.noodnummers.lijst(trip.id)])
      .then(([destinations, contacts]) => {
        if (!actueel) return;
        setBestemmingen(destinations);
        setNummers(contacts);
      })
      .catch((error: Error) => {
        if (actueel) setFout(error.message);
      });
    return () => {
      actueel = false;
    };
  }, [trip.id]);

  async function herlaadRoute(): Promise<void> {
    setRoute(await api.reisinfo.route(trip.id));
  }

  useEffect(() => {
    void herlaadRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  /**
   * Na een wijziging in de bestemmingenlijst (via het gedeelde component) de
   * route herberekenen én onze eigen kopie van de lijst verversen — die
   * gebruiken we hier alleen om de landen te bepalen voor "Verplicht in de auto".
   */
  async function herlaadNaWijziging(): Promise<void> {
    const [nieuweRoute, nieuweBestemmingen] = await Promise.all([
      api.reisinfo.route(trip.id),
      api.destinations.lijst(trip.id),
    ]);
    setRoute(nieuweRoute);
    setBestemmingen(nieuweBestemmingen);
  }

  async function metFout(werk: () => Promise<void>): Promise<void> {
    setBezig(true);
    setFout(null);
    try {
      await werk();
    } catch (error) {
      setFout((error as Error).message);
    } finally {
      setBezig(false);
    }
  }

  if (fout !== null && bestemmingen === null) return <Melding tekst={fout} />;
  if (bestemmingen === null || nummers === null) return <Laden />;

  // Landen waar je doorheen rijdt of verblijft, op volgorde van de eerste
  // bestemming waar dat land bij hoort — een reis kan door meerdere landen gaan.
  const landen = [
    ...new Set(
      bestemmingen.map((b) => b.land).filter((land): land is string => land !== null),
    ),
  ];

  return (
    <div className="space-y-4">
      {fout !== null && <Melding tekst={fout} onSluit={() => setFout(null)} />}

      {/* Afstand, rijtijd en tolkosten bovenaan. */}
      <Kaart>
        <KaartKop
          extra={
            route?.route != null ? (
              <span className="text-xs text-slate">volgens de route</span>
            ) : (
              <span className="text-xs text-slate">eigen invoer</span>
            )
          }
        >
          De rit
        </KaartKop>
        <dl className="grid grid-cols-3 gap-3">
          <div>
            <dt className="label-mono text-slate">afstand</dt>
            <dd className="mt-0.5 font-mono text-lg font-semibold text-ink">
              {afstand(route?.route?.totaalAfstandKm ?? trip.afstandKm)}
            </dd>
          </div>
          <div>
            <dt className="label-mono text-slate">rijtijd</dt>
            <dd className="mt-0.5 font-mono text-lg font-semibold text-ink">
              {rijtijd(route?.route?.totaalRijtijdMin ?? trip.rijtijdMin)}
            </dd>
          </div>
          <div>
            <dt className="label-mono text-slate">tol</dt>
            <dd className="mt-0.5 font-mono text-lg font-semibold text-ink">
              {bedrag(trip.tolKosten)}
            </dd>
          </div>
        </dl>

        {/* De berekende waarden kunnen afwijken van wat je zelf invulde. */}
        {route?.route != null &&
          (route.route.totaalAfstandKm !== trip.afstandKm ||
            route.route.totaalRijtijdMin !== trip.rijtijdMin) && (
            <div className="mt-3 border-t border-slate/12 pt-3">
              <p className="text-xs text-slate">
                Je eigen invoer: {afstand(trip.afstandKm)} en {rijtijd(trip.rijtijdMin)}. Het
                overzicht gebruikt de route.
              </p>
              <div className="mt-2">
                <Knop
                  disabled={bezig}
                  onClick={() =>
                    void metFout(async () => {
                      const resultaat = await api.reisinfo.routeOvernemen(trip.id);
                      if (!resultaat.overgenomen) {
                        setFout(REDEN_TEKST[resultaat.reden] ?? "Overnemen lukte niet.");
                        return;
                      }
                      onTripGewijzigd();
                    })
                  }
                >
                  Neem de route over
                </Knop>
              </div>
            </div>
          )}
      </Kaart>

      {/* Route van huis via de bestemmingen onderweg naar de eindbestemming. */}
      <RouteEtappes route={route} />

      {/* De route als kaart: vertrekpunt, bestemmingen onderweg en eindbestemming. */}
      {route !== null && route.punten.length > 0 && (
        <Kaart>
          <KaartKop>Kaart</KaartKop>
          <Landkaart punten={route.punten} geometrie={route.route?.geometrie} />
        </Kaart>
      )}

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
        {/* Bestemmingen: dezelfde lijst als bij de reisinstellingen, hier ook
            te beheren — precies waar je onderweg een extra stop bedenkt. */}
        <Bestemmingen tripId={trip.id} onGewijzigd={() => void herlaadNaWijziging()} />

        <div className="space-y-4">
          {/* Verplicht in de auto, per land dat de reis doorkruist. */}
          {landen.length > 0 && (
            <Kaart className="space-y-3">
              <KaartKop>Verplicht in de auto</KaartKop>
              {landen.map((land) => (
                <div key={land}>
                  {landen.length > 1 && (
                    <p className="label-mono mb-1.5 text-slate">{land}</p>
                  )}
                  <ul className="space-y-1.5">
                    {verplichtInDeAuto(land).map((ding) => (
                      <li key={ding} className="flex items-start gap-2 text-sm text-ink">
                        <span
                          aria-hidden="true"
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-forest"
                        />
                        {ding}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Kaart>
          )}

          {/* Noodnummers als grote knoppen met tel:-link. */}
          <Kaart>
            <KaartKop>Noodnummers</KaartKop>

            {/* Officiële nummers van het land van bestemming — je hoeft ze
                niet zelf op te zoeken en in te typen. */}
            {landen.length > 0 && (
              <div className="mb-4 space-y-3 border-b border-slate/12 pb-4">
                <p className="label-mono text-slate">Officieel</p>
                {landen.map((land) => (
                  <div key={land}>
                    {landen.length > 1 && (
                      <p className="mb-1.5 text-xs font-semibold text-ink">{land}</p>
                    )}
                    <ul className="grid grid-cols-2 gap-2">
                      {officieleNoodnummers(land).map((nummer) => (
                        <li key={nummer.label}>
                          <a
                            href={`tel:${nummer.nummer.replace(/[ ()-]/g, "")}`}
                            className="flex items-center justify-between gap-2 rounded-xl border border-navy/20 bg-white px-3 py-2.5 text-navy transition-colors hover:bg-navy/5"
                          >
                            <span className="min-w-0 truncate text-xs font-semibold">
                              {nummer.label}
                            </span>
                            <span className="label-mono shrink-0 text-sm font-semibold">
                              {nummer.nummer}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {landen.length > 0 && <p className="label-mono mb-2 text-slate">Eigen contacten</p>}
            {nummers.length === 0 ? (
              <LegeStaat
                titel="Nog geen noodnummers"
                uitnodiging="Zet 112 erin, en het nummer van je verzekeraar."
              />
            ) : (
              <ul className="space-y-2">
                {nummers.map((nummer) => (
                  <li key={nummer.id} className="flex items-stretch gap-2">
                    <a
                      href={`tel:${nummer.telefoonnummer.replace(/[ ()-]/g, "")}`}
                      className="flex min-w-0 flex-1 items-center justify-between rounded-xl bg-navy px-4 py-3.5 text-canvas transition-colors hover:bg-navy-deep"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {nummer.label}
                        </span>
                        <span className="label-mono block text-canvas/70">
                          {nummer.telefoonnummer}
                        </span>
                      </span>
                      <span aria-hidden="true" className="ml-3 shrink-0 text-amber">
                        Bel
                      </span>
                    </a>
                    <button
                      type="button"
                      onClick={() =>
                        void metFout(async () => {
                          await api.noodnummers.verwijder(nummer.id);
                          setNummers((nummers ?? []).filter((n) => n.id !== nummer.id));
                        })
                      }
                      aria-label={`${nummer.label} verwijderen`}
                      className="shrink-0 rounded-xl px-3 text-xs text-slate hover:bg-alert/8 hover:text-alert"
                    >
                      Weg
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 space-y-2 border-t border-slate/12 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <Veld label="Wie">
                  <input
                    className={INVOER_STIJL}
                    placeholder="ANWB"
                    value={nieuwLabel}
                    onChange={(event) => setNieuwLabel(event.target.value)}
                  />
                </Veld>
                <Veld label="Nummer">
                  <input
                    className={INVOER_STIJL}
                    inputMode="tel"
                    placeholder="+31 70 314 1414"
                    value={nieuwNummer}
                    onChange={(event) => setNieuwNummer(event.target.value)}
                  />
                </Veld>
              </div>
              <Knop
                breed
                disabled={bezig || nieuwLabel.trim() === "" || nieuwNummer.trim() === ""}
                onClick={() =>
                  void metFout(async () => {
                    const nieuw = await api.noodnummers.voegToe(
                      trip.id,
                      nieuwLabel.trim(),
                      nieuwNummer.trim(),
                    );
                    setNummers([...(nummers ?? []), nieuw]);
                    setNieuwLabel("");
                    setNieuwNummer("");
                  })
                }
              >
                Nummer toevoegen
              </Knop>
            </div>
          </Kaart>
        </div>
      </div>
    </div>
  );
}

/** De echte rijafstanden per deel van de route. */
function RouteEtappes({ route }: { route: RouteAntwoord | null }) {
  if (route === null) {
    return (
      <Kaart>
        <KaartKop>Route</KaartKop>
        <p className="label-mono py-4 text-center text-slate" role="status">
          Route berekenen
        </p>
      </Kaart>
    );
  }

  if (route.route === null) {
    return (
      <Kaart>
        <KaartKop>Route</KaartKop>
        <p className="text-sm text-slate">
          {REDEN_TEKST[route.reden] ?? "Geen route beschikbaar."}
        </p>
      </Kaart>
    );
  }

  return (
    <Kaart>
      <KaartKop
        extra={
          <span className="text-xs text-slate">
            {!route.onderweg
              ? "in één keer"
              : `via ${route.onderweg} ${route.onderweg === 1 ? "tussenstop" : "tussenstops"}`}
          </span>
        }
      >
        Route
      </KaartKop>
      <ol className="space-y-2">
        {route.route.etappes.map((etappe, index) => (
          <li key={index} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-canvas font-mono text-xs font-semibold text-slate"
            >
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-ink">
              {etappe.vanaf} <span className="text-slate">→</span> {etappe.naar}
            </span>
            <span className="shrink-0 font-mono text-xs text-slate">
              {afstand(etappe.afstandKm)} · {rijtijd(etappe.rijtijdMin)}
            </span>
          </li>
        ))}
      </ol>
    </Kaart>
  );
}
