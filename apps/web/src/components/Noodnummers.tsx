import { useEffect, useState } from "react";
import { INVOER_STIJL, Kaart, KaartKop, Knop, LegeStaat, Melding, Veld } from "./ui.tsx";
import { api, type Contact } from "../lib/api.ts";
import { officieleNoodnummers } from "../lib/format.ts";

/**
 * Noodnummers als grote knoppen met een tel:-link, plus de officiële nummers
 * (politie, ambulance, ...) per land dat de reis doorkruist. Gedeeld tussen
 * heenreis, verblijf en terugreis — het zijn dezelfde contacten, gewoon op
 * meerdere plekken bruikbaar zonder daarvoor te moeten wisselen van scherm.
 */
export function Noodnummers({ tripId, landen }: { tripId: string; landen: string[] }) {
  const [nummers, setNummers] = useState<Contact[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [nieuwLabel, setNieuwLabel] = useState("");
  const [nieuwNummer, setNieuwNummer] = useState("");

  useEffect(() => {
    let actueel = true;
    api.noodnummers
      .lijst(tripId)
      .then((resultaat) => {
        if (actueel) setNummers(resultaat);
      })
      .catch((error: Error) => {
        if (actueel) setFout(error.message);
      });
    return () => {
      actueel = false;
    };
  }, [tripId]);

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

  if (nummers === null) {
    return fout !== null ? (
      <Kaart>
        <Melding tekst={fout} />
      </Kaart>
    ) : null;
  }

  return (
    <Kaart>
      <KaartKop>Noodnummers</KaartKop>

      {fout !== null && (
        <div className="mb-3">
          <Melding tekst={fout} onSluit={() => setFout(null)} />
        </div>
      )}

      {/* Officiële nummers van het land van bestemming — je hoeft ze niet
          zelf op te zoeken en in te typen. */}
      {landen.length > 0 && (
        <div className="mb-4 space-y-3 border-b border-slate/12 pb-4">
          <p className="label-mono text-slate">Officieel</p>
          {landen.map((land) => (
            <div key={land}>
              {landen.length > 1 && <p className="mb-1.5 text-xs font-semibold text-ink">{land}</p>}
              <ul className="grid grid-cols-2 gap-2">
                {officieleNoodnummers(land).map((nummer) => (
                  <li key={nummer.label}>
                    <a
                      href={`tel:${nummer.nummer.replace(/[ ()-]/g, "")}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-navy/20 bg-white px-3 py-2.5 text-navy transition-colors hover:bg-navy/5"
                    >
                      <span className="min-w-0 truncate text-xs font-semibold">{nummer.label}</span>
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
                  <span className="block truncate text-sm font-semibold">{nummer.label}</span>
                  <span className="label-mono block text-canvas/70">{nummer.telefoonnummer}</span>
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
                tripId,
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
  );
}
