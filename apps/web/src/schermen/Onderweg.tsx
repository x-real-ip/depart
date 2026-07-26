import { useEffect, useState } from "react";
import { AdresVeld } from "../components/AdresVeld.tsx";
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
  type NieuweStop,
  type RouteAntwoord,
  type Stop,
  type Trip,
} from "../lib/api.ts";
import { afstand, bedrag, rijtijd, verplichtInDeAuto } from "../lib/format.ts";

export function Onderweg({ trip, onTripGewijzigd }: { trip: Trip; onTripGewijzigd: () => void }) {
  const [etappes, setEtappes] = useState<Stop[] | null>(null);
  const [nummers, setNummers] = useState<Contact[] | null>(null);
  const [route, setRoute] = useState<RouteAntwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [bewerkt, setBewerkt] = useState<string | null>(null);

  const [nieuwLabel, setNieuwLabel] = useState("");
  const [nieuwNummer, setNieuwNummer] = useState("");

  // Welke etappe wordt op dit moment versleept.
  const [gesleept, setGesleept] = useState<string | null>(null);

  useEffect(() => {
    let actueel = true;
    Promise.all([api.etappes.lijst(trip.id), api.noodnummers.lijst(trip.id)])
      .then(([stops, contacts]) => {
        if (!actueel) return;
        setEtappes(stops);
        setNummers(contacts);
      })
      .catch((error: Error) => {
        if (actueel) setFout(error.message);
      });
    return () => {
      actueel = false;
    };
  }, [trip.id]);

  /** De route verandert zodra een overnachting erbij komt of verschuift. */
  async function herlaadRoute(): Promise<void> {
    setRoute(null);
    setRoute(await api.reisinfo.route(trip.id));
  }

  useEffect(() => {
    void herlaadRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

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

  /** Verplaatst een etappe naar een nieuwe plek en slaat de volgorde op. */
  async function verplaats(vanId: string, naarId: string): Promise<void> {
    const huidig = etappes ?? [];
    const vanIndex = huidig.findIndex((etappe) => etappe.id === vanId);
    const naarIndex = huidig.findIndex((etappe) => etappe.id === naarId);
    if (vanIndex === -1 || naarIndex === -1 || vanIndex === naarIndex) return;

    const nieuw = [...huidig];
    const [verplaatst] = nieuw.splice(vanIndex, 1);
    nieuw.splice(naarIndex, 0, verplaatst!);
    setEtappes(nieuw);

    try {
      const opgeslagen = await api.etappes.herorden(
        trip.id,
        nieuw.map((etappe) => etappe.id),
      );
      setEtappes(opgeslagen);
      if (opgeslagen.some((etappe) => etappe.overnachting)) await herlaadRoute();
    } catch (error) {
      setEtappes(huidig);
      setFout((error as Error).message);
    }
  }

  if (fout !== null && etappes === null) return <Melding tekst={fout} />;
  if (etappes === null || nummers === null) return <Laden />;

  const overnachtingen = etappes.filter((etappe) => etappe.overnachting);
  const nachtenOnderweg = overnachtingen.reduce(
    (som, etappe) => som + (etappe.nachten ?? 0),
    0,
  );

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

        {nachtenOnderweg > 0 && (
          <p className="mt-3 text-sm text-slate">
            {overnachtingen.length === 1 ? "Eén overnachting" : `${overnachtingen.length} overnachtingen`}{" "}
            onderweg, samen {nachtenOnderweg} {nachtenOnderweg === 1 ? "nacht" : "nachten"}.
          </p>
        )}

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

      {/* Route van huis via de overnachtingen naar de bestemming. */}
      <RouteEtappes route={route} />

      {/* De route als kaart: vertrekpunt, overnachtingen en bestemming. */}
      {route !== null && route.punten.length > 0 && (
        <Kaart>
          <KaartKop>Kaart</KaartKop>
          <Landkaart punten={route.punten} geometrie={route.route?.geometrie} />
        </Kaart>
      )}

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
        {/* Etappes, te verslepen om te sorteren. */}
        <Kaart className="p-0">
          <div className="px-4 pt-4">
            <KaartKop
              extra={
                etappes.length > 1 ? (
                  <span className="text-xs text-slate">Versleep om te sorteren</span>
                ) : undefined
              }
            >
              Etappes
            </KaartKop>
          </div>

          {etappes.length === 0 ? (
            <LegeStaat
              titel="Nog geen etappes"
              uitnodiging="Zet je eerste stop erin, bijvoorbeeld waar je gaat tanken of overnachten."
            />
          ) : (
            <ol className="divide-y divide-slate/12">
              {etappes.map((etappe, index) => (
                <li
                  key={etappe.id}
                  draggable={bewerkt === null}
                  onDragStart={() => setGesleept(etappe.id)}
                  onDragEnd={() => setGesleept(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (gesleept !== null) void verplaats(gesleept, etappe.id);
                    setGesleept(null);
                  }}
                  className={`px-4 py-3 ${gesleept === etappe.id ? "opacity-45" : ""}`}
                >
                  {bewerkt === etappe.id ? (
                    <EtappeFormulier
                      begin={etappe}
                      bezig={bezig}
                      bevestigLabel="Opslaan"
                      onBevestig={(velden) =>
                        void metFout(async () => {
                          const bijgewerkt = await api.etappes.werkBij(etappe.id, velden);
                          setEtappes(
                            (etappes ?? []).map((e) => (e.id === etappe.id ? bijgewerkt : e)),
                          );
                          setBewerkt(null);
                          if (bijgewerkt.overnachting || etappe.overnachting) {
                            await herlaadRoute();
                          }
                        })
                      }
                      onAnnuleer={() => setBewerkt(null)}
                    />
                  ) : (
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold ${
                          etappe.overnachting
                            ? "bg-forest text-white"
                            : "bg-navy text-canvas"
                        }`}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-ink">
                          {etappe.plaats}
                          {etappe.overnachting && (
                            <span className="label-mono rounded-full bg-forest/12 px-2 py-0.5 text-forest">
                              {etappe.nachten === 1
                                ? "1 nacht"
                                : `${etappe.nachten ?? 0} nachten`}
                            </span>
                          )}
                        </p>
                        {etappe.adres !== null && (
                          <p className="mt-0.5 truncate text-xs text-slate">{etappe.adres}</p>
                        )}
                        {etappe.opmerking !== null && (
                          <p className="mt-0.5 text-xs text-slate">{etappe.opmerking}</p>
                        )}
                      </div>
                      <span className="shrink-0 font-mono text-sm font-semibold text-ink">
                        {etappe.tijd ?? "—"}
                      </span>
                      <div className="flex shrink-0 flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => setBewerkt(etappe.id)}
                          className="rounded px-1.5 py-0.5 text-xs text-slate hover:bg-canvas hover:text-ink"
                          aria-label={`Etappe ${etappe.plaats} bewerken`}
                        >
                          Bewerk
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void metFout(async () => {
                              await api.etappes.verwijder(etappe.id);
                              setEtappes((etappes ?? []).filter((e) => e.id !== etappe.id));
                              if (etappe.overnachting) await herlaadRoute();
                            })
                          }
                          className="rounded px-1.5 py-0.5 text-xs text-slate hover:bg-alert/8 hover:text-alert"
                          aria-label={`Etappe ${etappe.plaats} verwijderen`}
                        >
                          Weg
                        </button>
                      </div>
                      {/* Verplaatsen met het toetsenbord, voor wie niet sleept. */}
                      <div className="flex shrink-0 flex-col gap-0.5">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => void verplaats(etappe.id, etappes[index - 1]!.id)}
                          aria-label={`${etappe.plaats} naar boven`}
                          className="rounded px-1.5 text-slate hover:bg-canvas hover:text-ink disabled:opacity-25"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={index === etappes.length - 1}
                          onClick={() => void verplaats(etappe.id, etappes[index + 1]!.id)}
                          aria-label={`${etappe.plaats} naar beneden`}
                          className="rounded px-1.5 text-slate hover:bg-canvas hover:text-ink disabled:opacity-25"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}

          <div className="border-t border-slate/12 p-4">
            <EtappeFormulier
              bezig={bezig}
              bevestigLabel="Etappe toevoegen"
              leegNa
              onBevestig={(velden) =>
                void metFout(async () => {
                  const nieuw = await api.etappes.voegToe(trip.id, velden);
                  setEtappes([...(etappes ?? []), nieuw]);
                  if (nieuw.overnachting) await herlaadRoute();
                })
              }
            />
          </div>
        </Kaart>

        <div className="space-y-4">
          {/* Verplicht in de auto, per land dat je doorkruist. */}
          <Kaart>
            <KaartKop>Verplicht in de auto — {trip.land}</KaartKop>
            <ul className="space-y-1.5">
              {verplichtInDeAuto(trip.land).map((ding) => (
                <li key={ding} className="flex items-start gap-2 text-sm text-ink">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-forest"
                  />
                  {ding}
                </li>
              ))}
            </ul>
          </Kaart>

          {/* Noodnummers als grote knoppen met tel:-link. */}
          <Kaart>
            <KaartKop>Noodnummers</KaartKop>
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
            {route.overnachtingen === 0
              ? "in één keer"
              : `via ${route.overnachtingen} ${route.overnachtingen === 1 ? "overnachting" : "overnachtingen"}`}
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

/**
 * Formulier voor één etappe, gebruikt voor toevoegen én bewerken. Zetten je de
 * schakelaar op overnachting, dan komen het adres en het aantal nachten erbij.
 */
function EtappeFormulier({
  begin,
  bezig,
  bevestigLabel,
  leegNa = false,
  onBevestig,
  onAnnuleer,
}: {
  begin?: Stop;
  bezig: boolean;
  bevestigLabel: string;
  /** Maak de velden leeg na opslaan; voor het toevoegformulier. */
  leegNa?: boolean;
  onBevestig: (velden: NieuweStop) => void;
  onAnnuleer?: () => void;
}) {
  const [plaats, setPlaats] = useState(begin?.plaats ?? "");
  const [tijd, setTijd] = useState(begin?.tijd ?? "");
  const [opmerking, setOpmerking] = useState(begin?.opmerking ?? "");
  const [overnachting, setOvernachting] = useState(begin?.overnachting ?? false);
  const [adres, setAdres] = useState(begin?.adres ?? "");
  const [nachten, setNachten] = useState(String(begin?.nachten ?? 1));
  // Alleen gevuld na een verse keuze uit de autocomplete in deze sessie —
  // anders blijven bestaande coördinaten gewoon staan (regelt de api zelf).
  const [coordVers, setCoordVers] = useState<{ lat: number; lon: number } | null>(null);
  const adresGeverifieerd =
    coordVers !== null || (adres === (begin?.adres ?? "") && (begin?.adresGeverifieerd ?? false));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Veld label="Plaats" verplicht ingevuld={plaats.trim() !== ""}>
          <input
            className={INVOER_STIJL}
            placeholder="Metz"
            value={plaats}
            onChange={(event) => setPlaats(event.target.value)}
          />
        </Veld>
        <Veld label={overnachting ? "Aankomst" : "Tijd"}>
          <input
            type="time"
            className={INVOER_STIJL}
            value={tijd}
            onChange={(event) => setTijd(event.target.value)}
          />
        </Veld>
      </div>

      {/* Schakelaar: tussenstop of overnachting. */}
      <button
        type="button"
        onClick={() => setOvernachting(!overnachting)}
        aria-pressed={overnachting}
        className="flex w-full items-center gap-3 rounded-xl border border-slate/25 bg-white px-3 py-2.5 text-left transition-colors hover:border-slate/50"
      >
        <span
          aria-hidden="true"
          className={`flex size-5 shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold ${
            overnachting ? "border-forest bg-forest text-white" : "border-slate/35 text-transparent"
          }`}
        >
          ✓
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">Hier overnachten</span>
          <span className="block text-xs text-slate">
            Een overnachting telt mee in de route naar de eindbestemming.
          </span>
        </span>
      </button>

      {overnachting && (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <AdresVeld
            label="Adres"
            hint="Kies een suggestie voor de route en de kaart."
            placeholder="Camping de l'Ile, Rue X 12"
            waarde={adres}
            geverifieerd={adresGeverifieerd}
            onWijzig={(tekst) => {
              setAdres(tekst);
              setCoordVers(null);
            }}
            onKies={(suggestie) => {
              setAdres(suggestie.label);
              setCoordVers({ lat: suggestie.lat, lon: suggestie.lon });
            }}
          />
          <Veld label="Nachten">
            <input
              className={`${INVOER_STIJL} w-20`}
              inputMode="numeric"
              value={nachten}
              onChange={(event) =>
                setNachten(event.target.value.replace(/\D/g, "").slice(0, 2))
              }
            />
          </Veld>
        </div>
      )}

      <Veld label="Opmerking">
        <input
          className={INVOER_STIJL}
          placeholder={overnachting ? "Sleutel ophalen bij de receptie" : "Tanken en lunch"}
          value={opmerking}
          onChange={(event) => setOpmerking(event.target.value)}
        />
      </Veld>

      <div className="flex gap-2">
        <Knop
          soort="primair"
          disabled={bezig || plaats.trim() === ""}
          onClick={() => {
            onBevestig({
              plaats: plaats.trim(),
              tijd: tijd === "" ? null : tijd,
              opmerking: opmerking.trim() === "" ? null : opmerking.trim(),
              overnachting,
              adres: overnachting && adres.trim() !== "" ? adres.trim() : null,
              nachten: overnachting ? Math.max(1, Number(nachten) || 1) : null,
              lat: overnachting ? coordVers?.lat : undefined,
              lon: overnachting ? coordVers?.lon : undefined,
            });
            if (leegNa) {
              setPlaats("");
              setTijd("");
              setOpmerking("");
              setOvernachting(false);
              setAdres("");
              setNachten("1");
              setCoordVers(null);
            }
          }}
        >
          {bevestigLabel}
        </Knop>
        {onAnnuleer !== undefined && (
          <Knop soort="stil" onClick={onAnnuleer}>
            Terug
          </Knop>
        )}
      </div>
    </div>
  );
}
