import { useEffect, useId, useRef, useState } from "react";
import { api, type AdresSuggestie } from "../lib/api.ts";
import { INVOER_STIJL, Veld } from "./ui.tsx";

/**
 * Adresveld met autocomplete. Typ minimaal drie tekens en er komen
 * suggesties; kies je er een, dan is het adres bevestigd (er zijn dan
 * coördinaten bekend). Typ je verder zonder te kiezen, dan geldt het adres
 * weer als onbevestigd — dat past bij een gebied waar verificatie ertoe doet.
 *
 * Een gewone combobox: pijltjes om te bladeren, Enter om te kiezen, Escape om
 * te sluiten, en de lijst blijft ook bereikbaar zonder muis.
 */
export function AdresVeld({
  label,
  waarde,
  geverifieerd,
  onWijzig,
  onKies,
  placeholder,
  hint,
  verplicht = false,
}: {
  label: string;
  waarde: string;
  /** Heeft de huidige waarde coördinaten? Bepaalt de bevestigingstekst. */
  geverifieerd: boolean;
  /** Bij vrij typen: het adres is daarmee onbevestigd, totdat er weer gekozen wordt. */
  onWijzig: (tekst: string) => void;
  onKies: (suggestie: AdresSuggestie) => void;
  placeholder?: string;
  hint?: string;
  verplicht?: boolean;
}) {
  const [suggesties, setSuggesties] = useState<AdresSuggestie[]>([]);
  const [open, setOpen] = useState(false);
  const [laden, setLaden] = useState(false);
  const [actieveIndex, setActieveIndex] = useState(-1);

  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  // Voorkomt dat een trage aanvraag van een oud, ingehaald zoekwoord de lijst
  // nog bijwerkt nadat er al opnieuw getypt is.
  const laatsteZoekterm = useRef("");

  useEffect(() => {
    function sluitBijKlikBuiten(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", sluitBijKlikBuiten);
    return () => document.removeEventListener("mousedown", sluitBijKlikBuiten);
  }, []);

  function typ(tekst: string): void {
    onWijzig(tekst);
    setActieveIndex(-1);
    window.clearTimeout(debounceRef.current);

    const zoekterm = tekst.trim();
    if (zoekterm.length < 3) {
      setSuggesties([]);
      setOpen(false);
      setLaden(false);
      return;
    }

    setOpen(true);
    setLaden(true);
    debounceRef.current = window.setTimeout(() => {
      laatsteZoekterm.current = zoekterm;
      void api.adressen
        .zoek(zoekterm)
        .then((resultaat) => {
          if (laatsteZoekterm.current !== zoekterm) return;
          setSuggesties(resultaat);
          setLaden(false);
        })
        .catch(() => {
          if (laatsteZoekterm.current !== zoekterm) return;
          // Een haperende autocomplete mag het typen niet in de weg zitten.
          setSuggesties([]);
          setLaden(false);
        });
    }, 300);
  }

  function kies(suggestie: AdresSuggestie): void {
    onKies(suggestie);
    setSuggesties([]);
    setOpen(false);
    setActieveIndex(-1);
  }

  function toetsenbord(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (!open || suggesties.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActieveIndex((index) => (index + 1) % suggesties.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActieveIndex((index) => (index <= 0 ? suggesties.length - 1 : index - 1));
    } else if (event.key === "Enter" && actieveIndex >= 0) {
      event.preventDefault();
      kies(suggesties[actieveIndex]!);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Veld label={label} hint={hint} verplicht={verplicht} ingevuld={waarde.trim() !== ""}>
        <input
          className={INVOER_STIJL}
          value={waarde}
          placeholder={placeholder}
          onChange={(event) => typ(event.target.value)}
          onKeyDown={toetsenbord}
          onFocus={() => {
            if (suggesties.length > 0) setOpen(true);
          }}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={actieveIndex >= 0 ? `${listboxId}-${actieveIndex}` : undefined}
        />
      </Veld>

      {waarde.trim() !== "" && (
        <p
          className={`mt-1 flex items-center gap-1 text-xs ${geverifieerd ? "text-forest" : "text-amber"}`}
        >
          <span aria-hidden="true">{geverifieerd ? "✓" : "○"}</span>
          {geverifieerd ? "Adres bevestigd" : "Kies een suggestie om dit adres te bevestigen"}
        </p>
      )}

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={`Suggesties voor ${label.toLowerCase()}`}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate/20 bg-white py-1 shadow-lg"
        >
          {laden && <li className="px-3 py-2 text-sm text-slate">Zoeken…</li>}
          {!laden && suggesties.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate">Geen adressen gevonden</li>
          )}
          {!laden &&
            suggesties.map((suggestie, index) => (
              <li key={index} id={`${listboxId}-${index}`} role="option" aria-selected={index === actieveIndex}>
                <button
                  type="button"
                  onClick={() => kies(suggestie)}
                  onMouseEnter={() => setActieveIndex(index)}
                  className={`block w-full px-3 py-2 text-left text-sm ${
                    index === actieveIndex ? "bg-canvas text-ink" : "text-ink hover:bg-canvas"
                  }`}
                >
                  {suggestie.label}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
