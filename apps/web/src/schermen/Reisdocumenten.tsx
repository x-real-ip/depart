import { useEffect, useState } from "react";
import { INVOER_STIJL, Kaart, KaartKop, Knop, Laden, Melding, VoortgangsBalk } from "../components/ui.tsx";
import { api, type Requirement } from "../lib/api.ts";

/**
 * De checklist reisdocumenten: paspoort, rijbewijs, reisverzekering, en zo.
 * Elke reis start met een standaardset; wat niet van toepassing is vink je
 * af of verwijder je gewoon. Onderdeel van de voorbereiding, niet van
 * onderweg-zijn — je regelt dit vóór vertrek.
 */
export function Reisdocumenten({ tripId }: { tripId: string }) {
  const [vereisten, setVereisten] = useState<Requirement[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [nieuweVereiste, setNieuweVereiste] = useState("");

  useEffect(() => {
    let actueel = true;
    api.vereisten
      .lijst(tripId)
      .then((resultaat) => {
        if (actueel) setVereisten(resultaat);
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

  async function wisselVereiste(item: Requirement): Promise<void> {
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
      const nieuw = await api.vereisten.voegToe(tripId, nieuweVereiste.trim());
      setVereisten([...(vereisten ?? []), nieuw]);
      setNieuweVereiste("");
    });
  }

  if (fout !== null && vereisten === null) return <Melding tekst={fout} />;
  if (vereisten === null) return <Laden />;

  const percentage =
    vereisten.length === 0
      ? 0
      : Math.round((vereisten.filter((item) => item.afgevinkt).length / vereisten.length) * 100);

  // Afgevinkte items zakken naar onderen; de volgorde daarbinnen blijft
  // hetzelfde, dus een item komt bij het uitvinken terug op zijn oude plek.
  const weergegeven = [...vereisten].sort((a, b) => Number(a.afgevinkt) - Number(b.afgevinkt));

  return (
    <div className="space-y-4">
      {fout !== null && <Melding tekst={fout} onSluit={() => setFout(null)} />}

      <Kaart>
        <KaartKop>Reisdocumenten</KaartKop>
        {vereisten.length > 0 && (
          <div className="mb-3">
            <VoortgangsBalk percentage={percentage} />
            <p className="mt-1.5 text-xs text-slate">
              {vereisten.filter((item) => item.afgevinkt).length} van {vereisten.length} klaar
            </p>
          </div>
        )}
        {vereisten.length > 0 && (
          <ul className="-mx-1 mb-3 divide-y divide-slate/12">
            {weergegeven.map((item) => (
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
    </div>
  );
}
