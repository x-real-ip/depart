import { useEffect, useState } from "react";
import { Noodnummers } from "../components/Noodnummers.tsx";
import { Kaart, KaartKop, Knop, Melding } from "../components/ui.tsx";
import {
  REDEN_KORT,
  REDEN_TEKST,
  api,
  type BezienswaardighedenAntwoord,
  type Destination,
  type Trip,
  type WeerAntwoord,
  type WeerDag,
  type WeerReeks,
} from "../lib/api.ts";
import { datumKort, datumLang, weerIcoon } from "../lib/format.ts";
import { Gerechten } from "./Gerechten.tsx";

/**
 * Hoe het is om er te zijn: de kampeerplek zelf, het weer, wat er in de
 * buurt te doen is, en de noodnummers voor tijdens het verblijf.
 */
export function Verblijf({
  trip,
  onNaarInstellingen,
}: {
  trip: Trip;
  onNaarInstellingen: () => void;
}) {
  const [bestemmingen, setBestemmingen] = useState<Destination[] | null>(null);
  const [weer, setWeer] = useState<WeerAntwoord | null>(null);
  const [bezienswaardigheden, setBezienswaardigheden] =
    useState<BezienswaardighedenAntwoord | null>(null);
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
    setWeer(null);
    void api.reisinfo.weer(trip.id).then((r) => {
      if (actueel) setWeer(r);
    });
    return () => {
      actueel = false;
    };
  }, [trip.id]);

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

  if (fout !== null && bestemmingen === null) return <Melding tekst={fout} />;
  if (bestemmingen === null) return null;

  const eindbestemming = bestemmingen.at(-1) ?? null;
  const landen = [
    ...new Set(bestemmingen.map((b) => b.land).filter((land): land is string => land !== null)),
  ];

  return (
    <div className="space-y-4">
      {fout !== null && <Melding tekst={fout} onSluit={() => setFout(null)} />}

      <Kaart className="border-forest/25 bg-forest/5">
        <KaartKop>Kampeerplek</KaartKop>
        {eindbestemming === null ? (
          <p className="text-sm text-slate">Nog geen bestemming ingevuld.</p>
        ) : (
          <>
            <p className="font-display text-xl font-extrabold text-forest">
              {eindbestemming.naam ?? eindbestemming.plaats}
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-3">
              <Gegeven label="regio" waarde={eindbestemming.regio ?? eindbestemming.land ?? "—"} />
              <Gegeven label="plaats" waarde={eindbestemming.plaatsnummer ?? "—"} />
              <Gegeven
                label="nachten"
                waarde={eindbestemming.nachten === null ? "—" : String(eindbestemming.nachten)}
              />
            </dl>
            {eindbestemming.opmerking !== null && (
              <p className="mt-3 text-sm text-slate">{eindbestemming.opmerking}</p>
            )}
          </>
        )}
      </Kaart>

      <WeerKaart weer={weer} onNaarInstellingen={onNaarInstellingen} />

      <BezienswaardighedenKaart gegevens={bezienswaardigheden} />

      <Gerechten tripId={trip.id} />

      <Noodnummers tripId={trip.id} landen={landen} />
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
  // Wat er mist, met de reden erbij. Eén plaats kan lukken en de andere niet.
  const missend = [
    weer.bestemming === null ? { wat: "de bestemming", reden: weer.bestemmingReden } : null,
    weer.thuis === null ? { wat: "thuis", reden: weer.thuisReden } : null,
  ].filter((m): m is { wat: string; reden: string } => m !== null);

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

      {/* Niet stil laten: zeg welke plaats mist en waarom. */}
      {missend.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-slate/12 pt-3">
          {missend.map((mist) => (
            <li key={mist.wat} className="text-xs text-slate">
              Geen verwachting voor {mist.wat} — {REDEN_KORT[mist.reden] ?? mist.reden}.
            </li>
          ))}
        </ul>
      )}
    </Kaart>
  );
}

function WeerKolom({ reeks }: { reeks: WeerReeks }) {
  // De eerste dag in de reeks is de eerstvolgende relevante dag (vandaag, of
  // de incheckdag als de reis nog niet begonnen is) — een echte dag met echte
  // cijfers, geen gemiddelde of piekwaarde over de hele periode die niet meer
  // overeenkomt met wat je buiten ziet.
  const eersteDag = reeks.dagen[0] ?? null;
  const { icoon, omschrijving } = weerIcoon(eersteDag?.weercode ?? null);
  const isVandaag = eersteDag !== null && eersteDag.datum === isoDatumVandaag();

  const [gekozenDatum, setGekozenDatum] = useState<string | null>(null);
  const gekozenDag = reeks.dagen.find((dag) => dag.datum === gekozenDatum) ?? null;

  return (
    <div className="rounded-xl bg-canvas px-3 py-3">
      <p className="label-mono text-slate">{reeks.plaats}</p>
      <div className="mt-1 flex items-center gap-2">
        {eersteDag !== null && (
          <span
            className="text-2xl leading-none"
            role="img"
            aria-label={omschrijving}
            title={omschrijving}
          >
            {icoon}
          </span>
        )}
        <p className="font-mono text-2xl font-semibold text-ink">
          {eersteDag?.maxTemp == null ? "—" : `${Math.round(eersteDag.maxTemp)}°`}
        </p>
      </div>
      <p className="text-[11px] text-slate/70">
        {eersteDag === null
          ? ""
          : `Weer voor ${isVandaag ? "vandaag" : datumKort(eersteDag.datum)} — tik een andere dag aan voor die dag.`}
      </p>
      <dl className="mt-2 space-y-0.5 text-xs text-slate">
        <Regel
          label="nacht"
          waarde={eersteDag?.minTemp == null ? "—" : `${Math.round(eersteDag.minTemp)}°`}
        />
        <Regel
          label="wind"
          waarde={eersteDag?.windKmh == null ? "—" : `${Math.round(eersteDag.windKmh)} km/u`}
        />
        <Regel label="regen" waarde={eersteDag?.regenkans == null ? "—" : `${eersteDag.regenkans}%`} />
      </dl>

      {/* De losse dagen, zodat je ziet of het één natte dag is of de hele week.
          Klik een dag voor het volledige overzicht daaronder. */}
      <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Kies een dag">
        {reeks.dagen.map((dag) => {
          const { icoon: dagIcoon, omschrijving: dagOmschrijving } = weerIcoon(dag.weercode);
          const actief = dag.datum === gekozenDatum;
          return (
            <li key={dag.datum} className="shrink-0">
              <button
                type="button"
                role="tab"
                aria-selected={actief}
                onClick={() => setGekozenDatum((huidig) => (huidig === dag.datum ? null : dag.datum))}
                className={`w-11 rounded-lg py-1 text-center transition-colors ${
                  actief ? "bg-white ring-1 ring-navy/25" : "hover:bg-white/60"
                }`}
              >
                <span className="label-mono block text-slate/70">{dagAfkorting(dag.datum)}</span>
                <span
                  className="mt-0.5 block text-base leading-none"
                  role="img"
                  aria-label={dagOmschrijving}
                >
                  {dagIcoon}
                </span>
                <span className="mt-0.5 block font-mono text-xs font-semibold text-ink">
                  {dag.maxTemp === null ? "—" : Math.round(dag.maxTemp)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {gekozenDag !== null && <DagDetail dag={gekozenDag} />}
    </div>
  );
}

function isoDatumVandaag(): string {
  const nu = new Date();
  return `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}-${String(nu.getDate()).padStart(2, "0")}`;
}

/** Volledig overzicht van één dag: geopend door er in de rij op te klikken. */
function DagDetail({ dag }: { dag: WeerDag }) {
  const { icoon, omschrijving } = weerIcoon(dag.weercode);
  return (
    <div className="mt-3 rounded-lg border border-slate/12 bg-white px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="text-2xl leading-none" role="img" aria-label={omschrijving}>
          {icoon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{datumLang(dag.datum)}</p>
          <p className="text-xs text-slate">{omschrijving}</p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        <Gegeven label="max" waarde={dag.maxTemp === null ? "—" : `${Math.round(dag.maxTemp)}°`} />
        <Gegeven label="min" waarde={dag.minTemp === null ? "—" : `${Math.round(dag.minTemp)}°`} />
        <Gegeven label="wind" waarde={dag.windKmh === null ? "—" : `${Math.round(dag.windKmh)} km/u`} />
      </dl>
      <p className="mt-2 text-xs text-slate">
        {dag.regenkans === null ? "Regenkans onbekend" : `${dag.regenkans}% kans op regen`}
      </p>
    </div>
  );
}

/** Welk icoon het vaakst voorkomt over de dagen heen — het algemene beeld, niet één dag. */
function Regel({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className="font-mono">{waarde}</dd>
    </div>
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
            ? "Niets gevonden binnen ongeveer een uur rijden van je bestemming."
            : (REDEN_TEKST[gegevens.reden] ?? "Geen bezienswaardigheden beschikbaar.")}
        </p>
      </Kaart>
    );
  }

  return (
    <Kaart className="p-0">
      <div className="px-4 pt-4 pb-1">
        <KaartKop extra={<span className="text-xs text-slate">binnen ~1 uur rijden</span>}>
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

// --- Rekenhulp -------------------------------------------------------------

const DAG_AFKORTING = new Intl.DateTimeFormat("nl-NL", { weekday: "short" });

function dagAfkorting(isoDatum: string): string {
  return DAG_AFKORTING.format(new Date(`${isoDatum}T12:00:00`)).replace(".", "");
}
