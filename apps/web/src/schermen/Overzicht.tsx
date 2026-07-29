import { useEffect, useState } from "react";
import { SplitFlapAftelklok } from "../components/SplitFlap.tsx";
import { Kaart, Laden, Melding, VoortgangsBalk } from "../components/ui.tsx";
import {
  api,
  type Destination,
  type Overzicht as OverzichtGegevens,
  type RouteAntwoord,
  type TripMetReizigers,
} from "../lib/api.ts";
import { afstand, dagenTot, datumKort, verplichtInDeAuto } from "../lib/format.ts";
import type { Tab } from "../App.tsx";
import type { VoorbereidingSubtab } from "./Voorbereiding.tsx";

/**
 * Het overzicht beantwoordt de vraag "ben ik klaar om te vertrekken?" en niets
 * anders. De statusregels zijn knoppen naar het bijbehorende tabblad. Details
 * over de kampeerplek, het weer en de route staan bij Verblijf en Heenreis.
 */
export function Overzicht({
  trip,
  gaNaar,
}: {
  trip: TripMetReizigers;
  gaNaar: (tab: Tab, subtab?: VoorbereidingSubtab) => void;
}) {
  const [gegevens, setGegevens] = useState<OverzichtGegevens | null>(null);
  const [bestemmingen, setBestemmingen] = useState<Destination[] | null>(null);
  const [route, setRoute] = useState<RouteAntwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    let actueel = true;
    setGegevens(null);
    setBestemmingen(null);
    Promise.all([api.trips.overzicht(trip.id), api.destinations.lijst(trip.id)])
      .then(([overzicht, destinations]) => {
        if (!actueel) return;
        setGegevens(overzicht);
        setBestemmingen(destinations);
      })
      .catch((error: Error) => {
        if (actueel) setFout(error.message);
      });
    return () => {
      actueel = false;
    };
  }, [trip.id]);

  // De route apart: die mag langer duren en het scherm hoeft er niet op te
  // wachten, dit is alleen nodig voor de afstand in het vertrekbord.
  useEffect(() => {
    let actueel = true;
    setRoute(null);
    void api.reisinfo.route(trip.id).then((r) => {
      if (actueel) setRoute(r);
    });
    return () => {
      actueel = false;
    };
  }, [trip.id]);

  if (fout !== null) return <Melding tekst={fout} />;
  if (gegevens === null || bestemmingen === null) return <Laden />;

  const { documenten, inpaklijsten, taken } = gegevens;
  const dagen = dagenTot(trip.vertrekdatum);
  const vertrekVan = trip.thuisplaats ?? "thuis";
  // De laatste in de volgorde is de eindbestemming van de reis.
  const eindbestemming = bestemmingen.at(-1) ?? null;
  const landen = [
    ...new Set(
      bestemmingen.map((b) => b.land).filter((land): land is string => land !== null),
    ),
  ];

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
                {eindbestemming === null
                  ? "nog geen bestemming"
                  : (eindbestemming.naam ?? eindbestemming.plaats)}
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

      {/* Vertrekstatus: het eerste wat je ziet — dit is de vraag waar het
          hele scherm om draait. */}
      <VertrekstatusKaart
        documenten={documenten}
        inpaklijsten={inpaklijsten}
        taken={taken}
        eindbestemming={eindbestemming}
        landen={landen}
        gaNaar={gaNaar}
      />
    </div>
  );
}

/** Eén item op de vertrek-checklist: is het klaar, en zo niet, hoe erg is dat. */
interface ChecklistItem {
  label: string;
  waarde: string;
  klaar: boolean;
  kritiek: boolean;
  percentage?: number;
  onClick: () => void;
}

const STATUS_STIJL = {
  klaar: {
    icoon: "✅",
    tekst: "Klaar om te vertrekken",
    kaart: "border-forest/30 bg-forest/5",
    kop: "text-forest",
  },
  waarschuwing: {
    icoon: "⚠️",
    tekst: "Nog enkele taken open",
    kaart: "border-amber/40 bg-amber/10",
    kop: "text-ink",
  },
  kritiek: {
    icoon: "❌",
    tekst: "Niet klaar om te vertrekken",
    kaart: "border-alert/40 bg-alert/8",
    kop: "text-alert",
  },
} as const;

/**
 * De belangrijkste vraag van de app, in het groot: kan ik nu vertrekken?
 * Eén duidelijke status bovenaan, met eronder precies welke taken dat nog
 * in de weg staan — zodat je niet per tabblad hoeft te gaan kijken.
 */
function VertrekstatusKaart({
  documenten,
  inpaklijsten,
  taken,
  eindbestemming,
  landen,
  gaNaar,
}: {
  documenten: OverzichtGegevens["documenten"];
  inpaklijsten: OverzichtGegevens["inpaklijsten"];
  taken: OverzichtGegevens["taken"];
  eindbestemming: Destination | null;
  landen: string[];
  gaNaar: (tab: Tab, subtab?: VoorbereidingSubtab) => void;
}) {
  const items: ChecklistItem[] = [
    {
      label: "Bestemming",
      waarde:
        eindbestemming === null
          ? "nog geen bestemming ingevuld"
          : landen.length === 0
            ? "vul een land in bij je bestemmingen"
            : landen.length === 1
              ? `${verplichtInDeAuto(landen[0]!).length} dingen verplicht in ${landen[0]}`
              : `verplichte spullen voor ${landen.length} landen`,
      klaar: eindbestemming !== null && landen.length > 0,
      kritiek: eindbestemming === null,
      onClick: () => gaNaar(eindbestemming === null ? "instellingen" : "heenreis"),
    },
    {
      label: "Documenten",
      waarde:
        documenten.totaal === 0
          ? "nog niets toegevoegd"
          : documenten.ontbreekt > 0
            ? `${documenten.ontbreekt} van ${documenten.totaal} ontbreekt`
            : documenten.letOp > 0
              ? `${documenten.letOp} verlopen bijna`
              : "alles op orde",
      klaar: documenten.ontbreekt === 0 && documenten.letOp === 0,
      kritiek: documenten.ontbreekt > 0,
      onClick: () => gaNaar("voorbereiding", "documenten"),
    },
    {
      label: "Inpaklijsten",
      waarde:
        inpaklijsten.lijsten === 0
          ? "nog geen lijst"
          : `${inpaklijsten.afgevinkt} van ${inpaklijsten.totaal} klaar, ${inpaklijsten.lijsten} ${inpaklijsten.lijsten === 1 ? "lijst" : "lijsten"}`,
      klaar: inpaklijsten.lijsten > 0 && inpaklijsten.percentage === 100,
      kritiek: false,
      percentage: inpaklijsten.lijsten === 0 ? undefined : inpaklijsten.percentage,
      onClick: () => gaNaar("voorbereiding", "inpaklijst"),
    },
    {
      label: "Taken",
      waarde:
        taken.lijsten === 0
          ? "nog geen lijst"
          : `${taken.afgevinkt} van ${taken.totaal} klaar, ${taken.lijsten} ${taken.lijsten === 1 ? "lijst" : "lijsten"}`,
      klaar: taken.lijsten > 0 && taken.percentage === 100,
      kritiek: false,
      percentage: taken.lijsten === 0 ? undefined : taken.percentage,
      onClick: () => gaNaar("voorbereiding", "taken"),
    },
  ];

  const open = items.filter((item) => !item.klaar);
  const status = open.length === 0 ? "klaar" : open.some((item) => item.kritiek) ? "kritiek" : "waarschuwing";
  const stijl = STATUS_STIJL[status];

  return (
    <Kaart className={`p-0 ${stijl.kaart}`}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <span aria-hidden="true" className="text-3xl leading-none">
          {stijl.icoon}
        </span>
        <div className="min-w-0">
          <h2 className={`font-display text-lg font-extrabold ${stijl.kop}`}>{stijl.tekst}</h2>
          <p className="text-xs text-slate">
            {open.length === 0
              ? "Alle taken zijn afgerond."
              : `${open.length} van ${items.length} ${open.length === 1 ? "taak staat" : "taken staan"} nog open: ${open.map((item) => item.label).join(", ")}.`}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-slate/12 border-t border-slate/12">
        {items.map((item) => (
          <li key={item.label}>
            <StatusRegel
              label={item.label}
              waarde={item.waarde}
              percentage={item.percentage}
              kleur={item.kritiek ? "alert" : item.klaar ? "forest" : "amber"}
              onClick={item.onClick}
            />
          </li>
        ))}
      </ul>
    </Kaart>
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
