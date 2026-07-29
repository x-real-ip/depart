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
  VoortgangsBalk,
} from "../components/ui.tsx";
import {
  REDEN_TEKST,
  api,
  type BezienswaardighedenAntwoord,
  type Contact,
  type Destination,
  type Requirement,
  type RouteAntwoord,
  type TolAntwoord,
  type Trip,
  type VerkeerAntwoord,
} from "../lib/api.ts";
import { afstand, bedrag, officieleNoodnummers, rijtijd, verplichtInDeAuto } from "../lib/format.ts";

export function Onderweg({ trip, onTripGewijzigd }: { trip: Trip; onTripGewijzigd: () => void }) {
  const [bestemmingen, setBestemmingen] = useState<Destination[] | null>(null);
  const [nummers, setNummers] = useState<Contact[] | null>(null);
  const [vereisten, setVereisten] = useState<Requirement[] | null>(null);
  const [route, setRoute] = useState<RouteAntwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const [nieuwLabel, setNieuwLabel] = useState("");
  const [nieuwNummer, setNieuwNummer] = useState("");
  const [nieuweVereiste, setNieuweVereiste] = useState("");

  useEffect(() => {
    let actueel = true;
    Promise.all([
      api.destinations.lijst(trip.id),
      api.noodnummers.lijst(trip.id),
      api.vereisten.lijst(trip.id),
    ])
      .then(([destinations, contacts, requirements]) => {
        if (!actueel) return;
        setBestemmingen(destinations);
        setNummers(contacts);
        setVereisten(requirements);
      })
      .catch((error: Error) => {
        if (actueel) setFout(error.message);
      });
    return () => {
      actueel = false;
    };
  }, [trip.id]);

  async function wisselVereiste(item: Requirement): Promise<void> {
    // Direct in beeld bijwerken; de api volgt. Bij een fout zetten we terug.
    const vorige = vereisten ?? [];
    setVereisten(vorige.map((r) => (r.id === item.id ? { ...r, afgevinkt: !r.afgevinkt } : r)));
    try {
      await api.vereisten.werkBij(item.id, { afgevinkt: !item.afgevinkt });
    } catch (error) {
      setVereisten(vorige);
      setFout((error as Error).message);
    }
  }

  async function voegVereisteToe(): Promise<void> {
    if (nieuweVereiste.trim() === "") return;
    await metFout(async () => {
      const nieuw = await api.vereisten.voegToe(trip.id, nieuweVereiste.trim());
      setVereisten([...(vereisten ?? []), nieuw]);
      setNieuweVereiste("");
    });
  }

  async function herlaadRoute(): Promise<void> {
    setRoute(await api.reisinfo.route(trip.id));
  }

  useEffect(() => {
    void herlaadRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  const [bezienswaardigheden, setBezienswaardigheden] =
    useState<BezienswaardighedenAntwoord | null>(null);

  // Apart van de rest: dit kan een paar seconden duren (Overpass doorzoekt
  // een heel gebied) en de rest van het scherm hoeft daar niet op te wachten.
  useEffect(() => {
    let actueel = true;
    setBezienswaardigheden(null);
    void api.reisinfo.bezienswaardigheden(trip.id).then((antwoord) => {
      if (actueel) setBezienswaardigheden(antwoord);
    });
    return () => {
      actueel = false;
    };
  }, [trip.id]);

  const [verkeer, setVerkeer] = useState<VerkeerAntwoord | null>(null);

  useEffect(() => {
    let actueel = true;
    setVerkeer(null);

    async function ververs(): Promise<void> {
      const antwoord = await api.reisinfo.verkeer(trip.id);
      if (actueel) setVerkeer(antwoord);
    }

    void ververs();
    // Elke vijf minuten opnieuw ophalen — precies vaak genoeg om onderweg
    // actueel te blijven. De backend bepaalt zelf hoe vers het antwoord is:
    // ruim voor de reis komt hetzelfde uit de cache, vlak ervoor en tijdens
    // de reis wordt er echt opnieuw bij TomTom gekeken.
    const interval = window.setInterval(() => void ververs(), 5 * 60_000);

    return () => {
      actueel = false;
      window.clearInterval(interval);
    };
  }, [trip.id]);

  const [tol, setTol] = useState<TolAntwoord | null>(null);

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
   * Na een wijziging in de bestemmingenlijst (via het gedeelde component) de
   * route herberekenen én onze eigen kopie van de lijst verversen — die
   * gebruiken we hier alleen om de landen te bepalen voor "Verplicht in de auto".
   * De tolschatting verandert mee zodra de route dat doet.
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
  if (bestemmingen === null || nummers === null || vereisten === null) return <Laden />;

  const vereistenPercentage =
    vereisten.length === 0
      ? 0
      : Math.round((vereisten.filter((item) => item.afgevinkt).length / vereisten.length) * 100);

  // Afgevinkte items zakken naar onderen; de volgorde daarbinnen blijft
  // hetzelfde, dus een item komt bij het uitvinken terug op zijn oude plek —
  // de eigenlijke volgorde in de data verandert hier niet, alleen de
  // weergave. Array.prototype.sort is stabiel, dus binnen elke groep blijft
  // de bestaande volgorde behouden.
  const vereistenWeergegeven = [...vereisten].sort(
    (a, b) => Number(a.afgevinkt) - Number(b.afgevinkt),
  );

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

      {/* Afstand, rijtijd en tolkosten bovenaan — allemaal automatisch
          berekend, niets om zelf in te vullen. trip.afstandKm/rijtijdMin/
          tolKosten zijn alleen nog een achtervang voor als de berekening
          een keer niet lukt; die houdt de app zelf stil bijgewerkt
          (zie de effects hieronder). */}
      <Kaart>
        <KaartKop
          extra={
            route?.route != null ? (
              <span className="text-xs text-slate">berekend</span>
            ) : undefined
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
              {bedrag(tol?.schatting?.totaalEUR ?? trip.tolKosten)}
            </dd>
          </div>
        </dl>

        {/* Grove schatting van de tolkosten, op basis van welke stukken van
            de route tolweg zijn — geen prijsopgave, wel een indicatie. */}
        {tol?.reden === "ok" && tol.schatting !== null && (
          <div className="mt-3 border-t border-slate/12 pt-3">
            <p className="label-mono mb-1.5 text-slate">tol, geschat</p>
            <ul className="space-y-0.5">
              {tol.schatting.onderdelen.map((onderdeel) => (
                <li
                  key={`${onderdeel.land}-${onderdeel.soort}`}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate text-ink">
                    {onderdeel.land}
                    <span className="text-slate">
                      {" "}
                      {onderdeel.soort === "vignet" ? "(vignet)" : `(${onderdeel.km} km tol)`}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-ink">{bedrag(onderdeel.bedragEUR)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-slate/12 pt-1.5">
              <span className="text-sm font-semibold text-ink">Totaal geschat</span>
              <span className="shrink-0 font-mono text-sm font-semibold text-ink">
                {bedrag(tol.schatting.totaalEUR)}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-slate">
              Een schatting op basis van gemiddelde tarieven, geen prijsopgave.
            </p>
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
          {/* Reisdocumenten: een afvinkbare checklist, met een startset zodra
              de reis is aangemaakt — wat niet van toepassing is vink je af
              of verwijder je gewoon. */}
          <Kaart>
            <KaartKop>Reisdocumenten</KaartKop>
            {vereisten.length > 0 && (
              <div className="mb-3">
                <VoortgangsBalk percentage={vereistenPercentage} />
                <p className="mt-1.5 text-xs text-slate">
                  {vereisten.filter((item) => item.afgevinkt).length} van {vereisten.length} klaar
                </p>
              </div>
            )}
            {vereisten.length > 0 && (
              <ul className="-mx-1 mb-3 divide-y divide-slate/12">
                {vereistenWeergegeven.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void wisselVereiste(item)}
                      aria-pressed={item.afgevinkt}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-canvas"
                    >
                      <span
                        aria-hidden="true"
                        className={`flex size-5 shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold ${
                          item.afgevinkt
                            ? "border-forest bg-forest text-white"
                            : "border-slate/35 text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                      <span
                        className={`truncate text-sm ${
                          item.afgevinkt ? "text-slate line-through" : "text-ink"
                        }`}
                      >
                        {item.label}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void metFout(async () => {
                          await api.vereisten.verwijder(item.id);
                          setVereisten((vereisten ?? []).filter((r) => r.id !== item.id));
                        })
                      }
                      aria-label={`${item.label} verwijderen`}
                      className="shrink-0 rounded-lg px-2 py-2 text-xs text-slate hover:bg-alert/8 hover:text-alert"
                    >
                      Weg
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 border-t border-slate/12 pt-3">
              <input
                className={INVOER_STIJL}
                placeholder="Bijvoorbeeld: groene kaart"
                value={nieuweVereiste}
                aria-label="Nieuw item op de checklist"
                onChange={(event) => setNieuweVereiste(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && nieuweVereiste.trim() !== "") {
                    event.preventDefault();
                    void voegVereisteToe();
                  }
                }}
              />
              <Knop
                soort="primair"
                disabled={bezig || nieuweVereiste.trim() === ""}
                onClick={voegVereisteToe}
              >
                Voeg toe
              </Knop>
            </div>
          </Kaart>

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

      {/* Actuele verkeersinformatie langs de route. */}
      <VerkeerKaart gegevens={verkeer} />

      {/* Bezienswaardigheden rond de eindbestemming: los onder de rest, dit
          mag zijn eigen tijd nemen. */}
      <BezienswaardighedenKaart gegevens={bezienswaardigheden} />
    </div>
  );
}

const INCIDENT_KLEUR: Record<string, string> = {
  onbekend: "bg-slate/12 text-slate",
  gering: "bg-slate/12 text-slate",
  matig: "bg-amber/20 text-navy",
  ernstig: "bg-alert/10 text-alert",
  "zeer ernstig": "bg-alert/10 text-alert",
};

/** uu:mm in de eigen tijdzone — genoeg detail voor "sinds" en "tot". */
function incidentTijd(iso: string): string {
  return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Files, ongelukken en wegwerkzaamheden langs de route, in de volgorde
 * waarin je ze tegenkomt. Op een regel klikken klapt 'm open met meer
 * detail en, als de locatie bekend is, een kaartje.
 */
function VerkeerKaart({ gegevens }: { gegevens: VerkeerAntwoord | null }) {
  const [open, setOpen] = useState<number | null>(null);

  if (gegevens === null) {
    return (
      <Kaart>
        <KaartKop>Verkeersinformatie</KaartKop>
        <p className="label-mono py-4 text-center text-slate" role="status">
          Verkeersinformatie ophalen
        </p>
      </Kaart>
    );
  }

  if (gegevens.reden !== "ok" || gegevens.incidenten.length === 0) {
    return (
      <Kaart>
        <KaartKop>Verkeersinformatie</KaartKop>
        <p className="text-sm text-slate">
          {gegevens.reden === "ok"
            ? "Geen files of incidenten gemeld langs de route."
            : (REDEN_TEKST[gegevens.reden] ?? "Geen verkeersinformatie beschikbaar.")}
        </p>
      </Kaart>
    );
  }

  return (
    <Kaart className="p-0">
      <div className="px-4 pt-4 pb-1">
        <KaartKop extra={<span className="text-xs text-slate">op volgorde van de reis</span>}>
          Verkeersinformatie
        </KaartKop>
      </div>
      <ul className="divide-y divide-slate/12">
        {gegevens.incidenten.map((incident, index) => {
          const uitgeklapt = open === index;
          return (
            <li key={index}>
              <button
                type="button"
                onClick={() => setOpen(uitgeklapt ? null : index)}
                aria-expanded={uitgeklapt}
                className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-canvas"
              >
                <span
                  className={`label-mono mt-0.5 shrink-0 rounded-full px-2 py-0.5 ${
                    INCIDENT_KLEUR[incident.ernst] ?? "bg-slate/12 text-slate"
                  }`}
                >
                  {incident.categorie}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {incident.omschrijving ?? incident.categorie}
                  </span>
                  {incident.weg !== null && (
                    <span className="block truncate text-xs text-slate">{incident.weg}</span>
                  )}
                </span>
                {incident.vertragingMin !== null && incident.vertragingMin > 0 && (
                  <span className="shrink-0 font-mono text-xs text-slate">
                    +{incident.vertragingMin} min
                  </span>
                )}
                <span aria-hidden="true" className="shrink-0 text-slate">
                  {uitgeklapt ? "︿" : "﹀"}
                </span>
              </button>

              {uitgeklapt && (
                <div className="space-y-3 px-4 pb-4">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    {(incident.van !== null || incident.naar !== null) && (
                      <div className="col-span-2">
                        <dt className="label-mono text-slate">traject</dt>
                        <dd className="text-ink">
                          {incident.van ?? "—"} <span className="text-slate">→</span>{" "}
                          {incident.naar ?? "—"}
                        </dd>
                      </div>
                    )}
                    {incident.beginTijd !== null && (
                      <div>
                        <dt className="label-mono text-slate">sinds</dt>
                        <dd className="text-ink">{incidentTijd(incident.beginTijd)}</dd>
                      </div>
                    )}
                    {incident.eindTijd !== null && (
                      <div>
                        <dt className="label-mono text-slate">verwacht tot</dt>
                        <dd className="text-ink">{incidentTijd(incident.eindTijd)}</dd>
                      </div>
                    )}
                  </dl>

                  {incident.lat !== null && incident.lon !== null && (
                    <Landkaart
                      punten={[
                        {
                          naam: incident.omschrijving ?? incident.categorie,
                          rol: "onderweg",
                          lat: incident.lat,
                          lon: incident.lon,
                        },
                      ]}
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Kaart>
  );
}

const POI_KLEUR: Record<string, string> = {
  Attractie: "bg-amber/20 text-navy",
  Strand: "bg-amber/20 text-navy",
  Museum: "bg-navy/10 text-navy",
  Uitkijkpunt: "bg-forest/12 text-forest",
  Natuurgebied: "bg-forest/12 text-forest",
  Restaurant: "bg-slate/12 text-slate",
};

/** Attracties, musea, natuur, stranden, restaurants en uitkijkpunten rond de eindbestemming. */
function BezienswaardighedenKaart({ gegevens }: { gegevens: BezienswaardighedenAntwoord | null }) {
  if (gegevens === null) {
    return (
      <Kaart>
        <KaartKop>Bezienswaardigheden in de buurt</KaartKop>
        <p className="label-mono py-4 text-center text-slate" role="status">
          Bezienswaardigheden zoeken
        </p>
      </Kaart>
    );
  }

  if (gegevens.reden !== "ok" || gegevens.bezienswaardigheden.length === 0) {
    return (
      <Kaart>
        <KaartKop>Bezienswaardigheden in de buurt</KaartKop>
        <p className="text-sm text-slate">
          {gegevens.reden === "ok"
            ? "Niets gevonden binnen 5 km van je bestemming."
            : (REDEN_TEKST[gegevens.reden] ?? "Geen bezienswaardigheden beschikbaar.")}
        </p>
      </Kaart>
    );
  }

  return (
    <Kaart className="p-0">
      <div className="px-4 pt-4 pb-1">
        <KaartKop extra={<span className="text-xs text-slate">binnen 5 km</span>}>
          Bezienswaardigheden in de buurt
        </KaartKop>
      </div>
      <ul className="divide-y divide-slate/12">
        {gegevens.bezienswaardigheden.map((plek, index) => (
          <li key={`${plek.naam}-${index}`} className="flex items-start gap-3 px-4 py-2.5">
            <span
              className={`label-mono mt-0.5 shrink-0 rounded-full px-2 py-0.5 ${
                POI_KLEUR[plek.categorie] ?? "bg-slate/12 text-slate"
              }`}
            >
              {plek.categorie}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{plek.naam}</span>
              {plek.openingstijden !== null && (
                <span className="block truncate text-xs text-slate">{plek.openingstijden}</span>
              )}
            </span>
            <span className="shrink-0 font-mono text-xs text-slate">
              {plek.afstandKm < 1
                ? `${Math.round(plek.afstandKm * 1000)} m`
                : `${plek.afstandKm.toLocaleString("nl-NL")} km`}
            </span>
          </li>
        ))}
      </ul>
    </Kaart>
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
