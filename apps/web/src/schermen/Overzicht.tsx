import { useEffect, useState } from "react";
import { SplitFlapAftelklok } from "../components/SplitFlap.tsx";
import { Kaart, KaartKop, Laden, Melding, VoortgangsBalk } from "../components/ui.tsx";
import { api, type Overzicht as OverzichtGegevens } from "../lib/api.ts";
import { afstand, dagenTot, datumKort, verplichtInDeAuto } from "../lib/format.ts";
import type { Tab } from "../App.tsx";

/**
 * Het overzicht beantwoordt de vraag "ben ik klaar om te vertrekken?" en niets
 * anders. De vier statusregels zijn knoppen naar het bijbehorende tabblad.
 */
export function Overzicht({
  tripId,
  vertrekVan,
  gaNaar,
}: {
  tripId: string;
  vertrekVan: string;
  gaNaar: (tab: Tab) => void;
}) {
  const [gegevens, setGegevens] = useState<OverzichtGegevens | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    let actueel = true;
    setGegevens(null);
    api.trips
      .overzicht(tripId)
      .then((resultaat) => {
        if (actueel) setGegevens(resultaat);
      })
      .catch((error: Error) => {
        if (actueel) setFout(error.message);
      });
    return () => {
      actueel = false;
    };
  }, [tripId]);

  if (fout !== null) return <Melding tekst={fout} />;
  if (gegevens === null) return <Laden />;

  const { trip, documenten, uitrusting, koffers } = gegevens;
  const dagen = dagenTot(trip.vertrekdatum);

  return (
    <div className="space-y-4">
      {/* Vertrekbord: van → naar, afstand, aftelklok. */}
      <header className="rounded-[var(--radius-card)] bg-navy px-4 pt-4 pb-5 text-canvas">
        <div className="flex items-baseline gap-2">
          <span className="label-mono text-canvas/60">van</span>
          <span className="font-display text-lg font-extrabold">{vertrekVan}</span>
          <span aria-hidden="true" className="text-amber">
            →
          </span>
          <span className="font-display text-lg font-extrabold">{trip.bestemming}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="label-mono text-canvas/60">{afstand(trip.afstandKm)}</span>
          <span className="label-mono text-canvas/60">
            {datumKort(trip.vertrekdatum)} – {datumKort(trip.terugdatum)}
          </span>
        </div>
        <div className="mt-4">
          <SplitFlapAftelklok dagen={dagen} />
        </div>
      </header>

      {/* De kampeerplek. */}
      <Kaart className="border-forest/25 bg-forest/5">
        <KaartKop>Kampeerplek</KaartKop>
        {trip.campingNaam === null ? (
          <p className="text-sm text-slate">Nog geen camping ingevuld.</p>
        ) : (
          <>
            <p className="font-display text-xl font-extrabold text-forest">{trip.campingNaam}</p>
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

      {/* Weer, nu nog met vaste plaatsaanduidingen: de echte API komt later. */}
      <Kaart>
        <KaartKop>Weer</KaartKop>
        <div className="grid grid-cols-2 gap-3">
          <WeerVak plaats={trip.bestemming} />
          <WeerVak plaats={vertrekVan} />
        </div>
        <p className="mt-3 text-xs text-slate">
          Nog geen weergegevens. Deze koppeling komt er later bij.
        </p>
      </Kaart>

      {/* Het statusblok: vier regels, elk een knop naar het tabblad. */}
      <Kaart className="p-0">
        <h2 className="label-mono px-4 pt-4 pb-1 text-slate">Ben ik klaar om te vertrekken?</h2>
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
    </div>
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

function WeerVak({ plaats }: { plaats: string }) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-3">
      <p className="label-mono text-slate">{plaats}</p>
      <p className="mt-1.5 font-mono text-2xl font-semibold text-slate/50">—</p>
      <dl className="mt-2 space-y-0.5 text-xs text-slate">
        <div className="flex justify-between">
          <dt>nacht</dt>
          <dd className="font-mono">—</dd>
        </div>
        <div className="flex justify-between">
          <dt>wind</dt>
          <dd className="font-mono">—</dd>
        </div>
        <div className="flex justify-between">
          <dt>regen</dt>
          <dd className="font-mono">—</dd>
        </div>
      </dl>
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
