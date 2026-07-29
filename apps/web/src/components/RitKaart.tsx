import { Kaart, KaartKop } from "./ui.tsx";
import { REDEN_TEKST, type RouteAntwoord, type TolAntwoord } from "../lib/api.ts";
import { afstand, bedrag, rijtijd } from "../lib/format.ts";

/**
 * Afstand, rijtijd en tolkosten — allemaal automatisch berekend, niets om
 * zelf in te vullen. Gedeeld tussen heenreis en terugreis; alleen de titel
 * en de achtervangwaarden (voor als de berekening een keer niet lukt)
 * verschillen.
 */
export function RitKaart({
  titel,
  route,
  tol,
  afstandFallback,
  rijtijdFallback,
  tolFallback,
}: {
  titel: string;
  route: RouteAntwoord | null;
  tol: TolAntwoord | null;
  afstandFallback: number | null;
  rijtijdFallback: number | null;
  tolFallback: number | null;
}) {
  return (
    <Kaart>
      <KaartKop
        extra={route?.route != null ? <span className="text-xs text-slate">berekend</span> : undefined}
      >
        {titel}
      </KaartKop>
      <dl className="grid grid-cols-3 gap-3">
        <div>
          <dt className="label-mono text-slate">afstand</dt>
          <dd className="mt-0.5 font-mono text-lg font-semibold text-ink">
            {afstand(route?.route?.totaalAfstandKm ?? afstandFallback)}
          </dd>
        </div>
        <div>
          <dt className="label-mono text-slate">rijtijd</dt>
          <dd className="mt-0.5 font-mono text-lg font-semibold text-ink">
            {rijtijd(route?.route?.totaalRijtijdMin ?? rijtijdFallback)}
          </dd>
        </div>
        <div>
          <dt className="label-mono text-slate">tol</dt>
          <dd className="mt-0.5 font-mono text-lg font-semibold text-ink">
            {bedrag(tol?.schatting?.totaalEUR ?? tolFallback)}
          </dd>
        </div>
      </dl>

      {/* Grove schatting van de tolkosten, op basis van welke stukken van de
          route tolweg zijn — geen prijsopgave, wel een indicatie. */}
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
  );
}

/** De echte rijafstanden per deel van de route. */
export function RouteEtappes({ route }: { route: RouteAntwoord | null }) {
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
        <p className="text-sm text-slate">{REDEN_TEKST[route.reden] ?? "Geen route beschikbaar."}</p>
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
