import { useEffect, useState } from "react";
import { SplitFlapAftelklok } from "../components/SplitFlap.tsx";
import { Kaart, KaartKop, Knop, Laden, Melding, VoortgangsBalk } from "../components/ui.tsx";
import {
  REDEN_TEKST,
  api,
  type Overzicht as OverzichtGegevens,
  type RouteAntwoord,
  type TripMetReizigers,
  type WeerAntwoord,
  type WeerReeks,
} from "../lib/api.ts";
import { afstand, dagenTot, datumKort, rijtijd, verplichtInDeAuto } from "../lib/format.ts";
import type { Tab } from "../App.tsx";

/**
 * Het overzicht beantwoordt de vraag "ben ik klaar om te vertrekken?" en niets
 * anders. De vier statusregels zijn knoppen naar het bijbehorende tabblad.
 *
 * Weer en route komen van buiten en kunnen ontbreken. Het scherm laat dan zien
 * waarom, en blijft verder gewoon werken.
 */
export function Overzicht({
  trip,
  gaNaar,
}: {
  trip: TripMetReizigers;
  gaNaar: (tab: Tab) => void;
}) {
  const [gegevens, setGegevens] = useState<OverzichtGegevens | null>(null);
  const [weer, setWeer] = useState<WeerAntwoord | null>(null);
  const [route, setRoute] = useState<RouteAntwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    let actueel = true;
    setGegevens(null);
    api.trips
      .overzicht(trip.id)
      .then((resultaat) => {
        if (actueel) setGegevens(resultaat);
      })
      .catch((error: Error) => {
        if (actueel) setFout(error.message);
      });
    return () => {
      actueel = false;
    };
  }, [trip.id]);

  // Weer en route apart: die mogen langer duren en het scherm hoeft er niet op
  // te wachten.
  useEffect(() => {
    let actueel = true;
    setWeer(null);
    setRoute(null);
    void api.reisinfo.weer(trip.id).then((r) => {
      if (actueel) setWeer(r);
    });
    void api.reisinfo.route(trip.id).then((r) => {
      if (actueel) setRoute(r);
    });
    return () => {
      actueel = false;
    };
  }, [trip.id]);

  if (fout !== null) return <Melding tekst={fout} />;
  if (gegevens === null) return <Laden />;

  const { documenten, uitrusting, koffers } = gegevens;
  const dagen = dagenTot(trip.vertrekdatum);
  const vertrekVan = trip.thuisplaats ?? "thuis";

  // De route is nauwkeuriger dan wat je zelf invulde; die krijgt voorrang.
  const totaalAfstand = route?.route?.totaalAfstandKm ?? trip.afstandKm;

  return (
    <div className="space-y-4">
      {/* Vertrekbord: van → naar, afstand, aftelklok. */}
      <header className="rounded-[var(--radius-card)] bg-navy px-4 pt-4 pb-5 text-canvas lg:px-6 lg:pt-6">
        <div className="lg:flex lg:items-end lg:justify-between lg:gap-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="label-mono text-canvas/60">van</span>
              <span className="font-display text-lg font-extrabold lg:text-2xl">{vertrekVan}</span>
              <span aria-hidden="true" className="text-amber">
                →
              </span>
              <span className="font-display text-lg font-extrabold lg:text-2xl">
                {trip.bestemming}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="label-mono text-canvas/60">{afstand(totaalAfstand)}</span>
              <span className="label-mono text-canvas/60">
                {datumKort(trip.vertrekdatum)} – {datumKort(trip.terugdatum)}
              </span>
              {trip.thuisplaats === null && (
                <button
                  type="button"
                  onClick={() => gaNaar("instellingen")}
                  className="label-mono text-amber underline decoration-amber/40 underline-offset-2"
                >
                  vul je thuisplaats in
                </button>
              )}
            </div>
          </div>
          <div className="mt-4 shrink-0 lg:mt-0">
            <SplitFlapAftelklok dagen={dagen} />
          </div>
        </div>
      </header>

      {/* Op desktop naast elkaar: links de plek en het weer, rechts de status. */}
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
        <div className="space-y-4">
          <Kaart className="border-forest/25 bg-forest/5">
            <KaartKop>Kampeerplek</KaartKop>
            {trip.campingNaam === null ? (
              <p className="text-sm text-slate">Nog geen camping ingevuld.</p>
            ) : (
              <>
                <p className="font-display text-xl font-extrabold text-forest">
                  {trip.campingNaam}
                </p>
                <dl className="mt-3 grid grid-cols-3 gap-3">
                  <Gegeven label="regio" waarde={trip.regio ?? trip.land} />
                  <Gegeven label="plaats" waarde={trip.plaatsnummer ?? "—"} />
                  <Gegeven label="nachten" waarde={String(trip.nachten)} />
                </dl>
                {trip.plaatsInfo !== null && (
                  <p className="mt-3 text-sm text-slate">{trip.plaatsInfo}</p>
                )}
              </>
            )}
          </Kaart>

          <WeerKaart weer={weer} onNaarInstellingen={() => gaNaar("instellingen")} />
        </div>

        <div className="space-y-4">
          {/* Het statusblok: vier regels, elk een knop naar het tabblad. */}
          <Kaart className="p-0">
            <h2 className="label-mono px-4 pt-4 pb-1 text-slate">
              Ben ik klaar om te vertrekken?
            </h2>
            <ul className="divide-y divide-slate/12">
              <li>
                <StatusRegel
                  label="Documenten"
                  waarde={
                    documenten.totaal === 0
                      ? "nog niets toegevoegd"
                      : documenten.ontbreekt > 0
                        ? `${documenten.ontbreekt} van ${documenten.totaal} ontbreekt`
                        : documenten.letOp > 0
                          ? `${documenten.letOp} verlopen bijna`
                          : "alles op orde"
                  }
                  kleur={
                    documenten.ontbreekt > 0 ? "alert" : documenten.letOp > 0 ? "amber" : "forest"
                  }
                  onClick={() => gaNaar("documenten")}
                />
              </li>
              <li>
                <StatusRegel
                  label="Uitrusting"
                  waarde={
                    uitrusting.totaal === 0
                      ? "nog geen lijst"
                      : `${uitrusting.afgevinkt} van ${uitrusting.totaal} ingeladen`
                  }
                  percentage={uitrusting.totaal === 0 ? undefined : uitrusting.percentage}
                  kleur={uitrusting.percentage === 100 ? "forest" : "amber"}
                  onClick={() => gaNaar("inpaklijst")}
                />
              </li>
              <li>
                <StatusRegel
                  label="Koffers"
                  waarde={
                    koffers.totaal === 0
                      ? "nog geen lijst"
                      : `${koffers.afgevinkt} van ${koffers.totaal} ingepakt`
                  }
                  percentage={koffers.totaal === 0 ? undefined : koffers.percentage}
                  kleur={koffers.percentage === 100 ? "forest" : "amber"}
                  onClick={() => gaNaar("inpaklijst")}
                />
              </li>
              <li>
                <StatusRegel
                  label="Reisadvies"
                  waarde={`${verplichtInDeAuto(trip.land).length} dingen verplicht in ${trip.land}`}
                  kleur="navy"
                  onClick={() => gaNaar("onderweg")}
                />
              </li>
            </ul>
          </Kaart>

          <RouteKaart route={route} onNaarOnderweg={() => gaNaar("onderweg")} />
        </div>
      </div>
    </div>
  );
}

/** Weersverwachting voor de bestemming en voor thuis, naast elkaar. */
function WeerKaart({
  weer,
  onNaarInstellingen,
}: {
  weer: WeerAntwoord | null;
  onNaarInstellingen: () => void;
}) {
  if (weer === null) {
    return (
      <Kaart>
        <KaartKop>Weer</KaartKop>
        <p className="label-mono py-4 text-center text-slate" role="status">
          Verwachting ophalen
        </p>
      </Kaart>
    );
  }

  const reeksen = [weer.bestemming, weer.thuis].filter((r): r is WeerReeks => r !== null);

  if (reeksen.length === 0) {
    return (
      <Kaart>
        <KaartKop>Weer</KaartKop>
        <p className="text-sm text-slate">
          {REDEN_TEKST[weer.reden] ?? "Geen verwachting beschikbaar."}
        </p>
        {weer.reden === "geen-thuisplaats" && (
          <div className="mt-3">
            <Knop onClick={onNaarInstellingen}>Naar instellingen</Knop>
          </div>
        )}
      </Kaart>
    );
  }

  const dektVerblijf = reeksen.some((reeks) => reeks.dektVerblijf);

  return (
    <Kaart>
      <KaartKop
        extra={
          <span className="text-xs text-slate">
            {dektVerblijf ? "tijdens het verblijf" : "komende week"}
          </span>
        }
      >
        Weer
      </KaartKop>

      {!dektVerblijf && (
        <p className="mb-3 text-xs text-slate">
          De reis ligt verder weg dan de verwachting reikt. Dit is het weer van nu.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {reeksen.map((reeks) => (
          <WeerKolom key={reeks.plaats} reeks={reeks} />
        ))}
      </div>
    </Kaart>
  );
}

function WeerKolom({ reeks }: { reeks: WeerReeks }) {
  // Het gemiddelde over de reeks geeft een beter beeld dan één dag.
  const gemiddeldeMax = gemiddelde(reeks.dagen.map((dag) => dag.maxTemp));
  const gemiddeldeMin = gemiddelde(reeks.dagen.map((dag) => dag.minTemp));
  const hoogsteWind = maximum(reeks.dagen.map((dag) => dag.windKmh));
  const hoogsteRegen = maximum(reeks.dagen.map((dag) => dag.regenkans));

  return (
    <div className="rounded-xl bg-canvas px-3 py-3">
      <p className="label-mono text-slate">{reeks.plaats}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-ink">
        {gemiddeldeMax === null ? "—" : `${Math.round(gemiddeldeMax)}°`}
      </p>
      <dl className="mt-2 space-y-0.5 text-xs text-slate">
        <Regel
          label="nacht"
          waarde={gemiddeldeMin === null ? "—" : `${Math.round(gemiddeldeMin)}°`}
        />
        <Regel label="wind" waarde={hoogsteWind === null ? "—" : `${Math.round(hoogsteWind)} km/u`} />
        <Regel
          label="regen"
          waarde={hoogsteRegen === null ? "—" : `${Math.round(hoogsteRegen)}%`}
        />
      </dl>

      {/* De losse dagen, zodat je ziet of het één natte dag is of de hele week. */}
      <ul className="mt-3 flex gap-1 overflow-x-auto pb-1">
        {reeks.dagen.map((dag) => (
          <li key={dag.datum} className="shrink-0 text-center">
            <span className="label-mono block text-slate/70">{dagAfkorting(dag.datum)}</span>
            <span className="mt-0.5 block font-mono text-xs font-semibold text-ink">
              {dag.maxTemp === null ? "—" : Math.round(dag.maxTemp)}
            </span>
            <span
              aria-hidden="true"
              className="mx-auto mt-1 block w-4 rounded-full bg-navy/15"
              style={{ height: `${Math.max(2, Math.round((dag.regenkans ?? 0) / 8))}px` }}
              title={`${dag.regenkans ?? 0}% regenkans`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Regel({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className="font-mono">{waarde}</dd>
    </div>
  );
}

/** Samenvatting van de route: thuis via de overnachtingen naar de bestemming. */
function RouteKaart({
  route,
  onNaarOnderweg,
}: {
  route: RouteAntwoord | null;
  onNaarOnderweg: () => void;
}) {
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
              : `${route.overnachtingen} keer overnachten`}
          </span>
        }
      >
        Route
      </KaartKop>

      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="label-mono text-slate">afstand</dt>
          <dd className="mt-0.5 font-mono text-lg font-semibold text-ink">
            {afstand(route.route.totaalAfstandKm)}
          </dd>
        </div>
        <div>
          <dt className="label-mono text-slate">rijtijd</dt>
          <dd className="mt-0.5 font-mono text-lg font-semibold text-ink">
            {rijtijd(route.route.totaalRijtijdMin)}
          </dd>
        </div>
      </dl>

      <ol className="mt-3 space-y-1.5 border-t border-slate/12 pt-3">
        {route.route.etappes.map((etappe, index) => (
          <li key={index} className="flex items-baseline gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink">
              {etappe.vanaf} <span className="text-slate">→</span> {etappe.naar}
            </span>
            <span className="shrink-0 font-mono text-xs text-slate">
              {afstand(etappe.afstandKm)} · {rijtijd(etappe.rijtijdMin)}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-3">
        <Knop soort="stil" onClick={onNaarOnderweg}>
          Naar onderweg
        </Knop>
      </div>
    </Kaart>
  );
}

function Gegeven({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div>
      <dt className="label-mono text-slate">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm font-semibold text-ink">{waarde}</dd>
    </div>
  );
}

const STIP_KLEUR = {
  alert: "bg-alert",
  amber: "bg-amber",
  forest: "bg-forest",
  navy: "bg-navy",
} as const;

function StatusRegel({
  label,
  waarde,
  percentage,
  kleur,
  onClick,
}: {
  label: string;
  waarde: string;
  percentage?: number;
  kleur: keyof typeof STIP_KLEUR;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-canvas"
    >
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${STIP_KLEUR[kleur]}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block truncate text-xs text-slate">{waarde}</span>
        {percentage !== undefined && (
          <span className="mt-1.5 block">
            <VoortgangsBalk percentage={percentage} />
          </span>
        )}
      </span>
      {percentage !== undefined && (
        <span className="shrink-0 font-mono text-sm font-semibold text-ink">{percentage}%</span>
      )}
      <span aria-hidden="true" className="shrink-0 text-slate">
        ›
      </span>
    </button>
  );
}

// --- Rekenhulp -------------------------------------------------------------

function gemiddelde(waarden: (number | null)[]): number | null {
  const echte = waarden.filter((waarde): waarde is number => waarde !== null);
  if (echte.length === 0) return null;
  return echte.reduce((som, waarde) => som + waarde, 0) / echte.length;
}

function maximum(waarden: (number | null)[]): number | null {
  const echte = waarden.filter((waarde): waarde is number => waarde !== null);
  return echte.length === 0 ? null : Math.max(...echte);
}

const DAG_AFKORTING = new Intl.DateTimeFormat("nl-NL", { weekday: "short" });

function dagAfkorting(isoDatum: string): string {
  return DAG_AFKORTING.format(new Date(`${isoDatum}T12:00:00`)).replace(".", "");
}
