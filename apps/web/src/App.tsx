import { useCallback, useEffect, useState } from "react";
import { Laden, Melding } from "./components/ui.tsx";
import { APP_TITLE, api, type Trip, type TripMetReizigers } from "./lib/api.ts";
import { Documenten } from "./schermen/Documenten.tsx";
import { Inpaklijst } from "./schermen/Inpaklijst.tsx";
import { Instellingen } from "./schermen/Instellingen.tsx";
import { Onderweg } from "./schermen/Onderweg.tsx";
import { Overzicht } from "./schermen/Overzicht.tsx";
import { ReisAanmaken } from "./schermen/ReisAanmaken.tsx";

export type Tab = "overzicht" | "documenten" | "inpaklijst" | "onderweg" | "instellingen";

const TABS: { id: Tab; label: string }[] = [
  { id: "overzicht", label: "Overzicht" },
  { id: "documenten", label: "Documenten" },
  { id: "inpaklijst", label: "Inpaklijst" },
  { id: "onderweg", label: "Onderweg" },
];

/** Onthoudt welke reis je het laatst bekeek. */
const LAATSTE_REIS = "depart.laatsteReis";

export function App() {
  const [reizen, setReizen] = useState<Trip[] | null>(null);
  const [actieveReis, setActieveReis] = useState<TripMetReizigers | null>(null);
  const [tab, setTab] = useState<Tab>("overzicht");
  const [maaktNieuweReis, setMaaktNieuweReis] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  /** Haalt de lijst reizen op en kiest er een om te tonen. */
  const laadReizen = useCallback(async (voorkeurId?: string) => {
    try {
      const lijst = await api.trips.lijst();
      setReizen(lijst);
      if (lijst.length === 0) {
        setActieveReis(null);
        return;
      }
      const gewenst =
        voorkeurId ?? window.localStorage.getItem(LAATSTE_REIS) ?? lijst[0]!.id;
      const gekozen = lijst.some((reis) => reis.id === gewenst) ? gewenst : lijst[0]!.id;
      setActieveReis(await api.trips.haal(gekozen));
      window.localStorage.setItem(LAATSTE_REIS, gekozen);
    } catch (error) {
      setFout((error as Error).message);
    }
  }, []);

  useEffect(() => {
    void laadReizen();
  }, [laadReizen]);

  /** Haalt de actieve reis opnieuw op, bijvoorbeeld na een wijziging. */
  const herlaadActieveReis = useCallback(async () => {
    if (actieveReis === null) return;
    try {
      const [lijst, reis] = await Promise.all([
        api.trips.lijst(),
        api.trips.haal(actieveReis.id),
      ]);
      setReizen(lijst);
      setActieveReis(reis);
    } catch (error) {
      setFout((error as Error).message);
    }
  }, [actieveReis]);

  async function wisselNaar(id: string): Promise<void> {
    window.localStorage.setItem(LAATSTE_REIS, id);
    setTab("overzicht");
    try {
      setActieveReis(await api.trips.haal(id));
    } catch (error) {
      setFout((error as Error).message);
    }
  }

  if (fout !== null && reizen === null) {
    return (
      <Schil>
        <Melding tekst={fout} />
      </Schil>
    );
  }

  if (reizen === null) {
    return (
      <Schil>
        <Laden tekst="Reizen ophalen" />
      </Schil>
    );
  }

  // Lege app of expliciet een nieuwe reis: alleen het aanmaakscherm.
  if (reizen.length === 0 || maaktNieuweReis) {
    return (
      <Schil>
        <ReisAanmaken
          onKlaar={(trip) => {
            setMaaktNieuweReis(false);
            setTab("overzicht");
            void laadReizen(trip.id);
          }}
          onAnnuleer={reizen.length === 0 ? undefined : () => setMaaktNieuweReis(false)}
        />
      </Schil>
    );
  }

  if (actieveReis === null) {
    return (
      <Schil>
        <Laden tekst="Reis ophalen" />
      </Schil>
    );
  }

  return (
    <Schil>
      {/* Bovenin wisselen tussen reizen. */}
      <div className="mb-3 flex items-center gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Kies een reis</span>
          <select
            value={actieveReis.id}
            onChange={(event) => void wisselNaar(event.target.value)}
            className="w-full truncate rounded-xl border border-slate/25 bg-white px-3 py-2 text-sm font-semibold text-ink"
          >
            {reizen.map((reis) => (
              <option key={reis.id} value={reis.id}>
                {reis.naam}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setMaaktNieuweReis(true)}
          className="shrink-0 rounded-xl border border-slate/25 bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-slate/50"
        >
          Nieuwe reis
        </button>
        <button
          type="button"
          onClick={() => setTab("instellingen")}
          aria-label="Instellingen"
          aria-current={tab === "instellingen" ? "page" : undefined}
          className={`shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold ${
            tab === "instellingen"
              ? "border-navy bg-navy text-canvas"
              : "border-slate/25 bg-white text-ink hover:border-slate/50"
          }`}
        >
          ⚙
        </button>
      </div>

      {fout !== null && (
        <div className="mb-3">
          <Melding tekst={fout} onSluit={() => setFout(null)} />
        </div>
      )}

      {/* Tabbladen. */}
      <nav className="mb-4" aria-label="Onderdelen">
        <ul className="flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setTab(item.id)}
                aria-current={tab === item.id ? "page" : undefined}
                className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
                  tab === item.id ? "bg-amber text-navy" : "bg-white text-slate hover:text-ink"
                }`}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "overzicht" && (
        <Overzicht trip={actieveReis} gaNaar={setTab} />
      )}
      {tab === "documenten" && (
        <Documenten tripId={actieveReis.id} reizigers={actieveReis.reizigers} />
      )}
      {tab === "inpaklijst" && (
        <Inpaklijst tripId={actieveReis.id} reizigers={actieveReis.reizigers} />
      )}
      {tab === "onderweg" && (
        <Onderweg trip={actieveReis} onTripGewijzigd={() => void herlaadActieveReis()} />
      )}
      {tab === "instellingen" && (
        <Instellingen
          trip={actieveReis}
          onBijgewerkt={() => void herlaadActieveReis()}
          onVerwijderd={() => {
            window.localStorage.removeItem(LAATSTE_REIS);
            setTab("overzicht");
            setActieveReis(null);
            void laadReizen();
          }}
        />
      )}
    </Schil>
  );
}

/**
 * Mobiel eerst: op een telefoon één kolom van maximaal 480 px. Op een groter
 * scherm mag de app de ruimte gebruiken — tot 1152 px, gecentreerd. De schermen
 * zelf zetten hun inhoud daar in twee kolommen.
 */
function Schil({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[480px] px-4 pt-4 pb-10 lg:max-w-6xl lg:px-8 lg:pt-8">
      <p className="label-mono mb-3 text-slate">{APP_TITLE}</p>
      {children}
    </div>
  );
}
