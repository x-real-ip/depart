import { useEffect, useMemo, useState } from "react";
import {
  Bevestiging,
  INVOER_STIJL,
  Kaart,
  Knop,
  Laden,
  LegeStaat,
  Melding,
  VoortgangsBalk,
} from "../components/ui.tsx";
import { api, type PackItem, type Traveler } from "../lib/api.ts";

/**
 * Bovenaan een schakelaar: Uitrusting plus één knop per reiziger. Per lijst een
 * voortgangsbalk en afvinkbare items; afvinken slaat direct op.
 */
export function Inpaklijst({
  tripId,
  reizigers,
}: {
  tripId: string;
  reizigers: Traveler[];
}) {
  const [items, setItems] = useState<PackItem[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  // null = de gezamenlijke uitrusting; anders de id van een reiziger.
  const [actieveLijst, setActieveLijst] = useState<string | null>(null);
  const [nieuwLabel, setNieuwLabel] = useState("");
  const [herschrijft, setHerschrijft] = useState<string | null>(null);
  const [herschrevenLabel, setHerschrevenLabel] = useState("");
  const [vraagWissen, setVraagWissen] = useState(false);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    let actueel = true;
    api.inpaklijst
      .lijst(tripId)
      .then((resultaat) => {
        if (actueel) setItems(resultaat);
      })
      .catch((error: Error) => {
        if (actueel) setFout(error.message);
      });
    return () => {
      actueel = false;
    };
  }, [tripId]);

  // De gekozen reiziger kan verdwenen zijn nadat hij verwijderd is.
  useEffect(() => {
    if (actieveLijst !== null && !reizigers.some((reiziger) => reiziger.id === actieveLijst)) {
      setActieveLijst(null);
    }
  }, [actieveLijst, reizigers]);

  const groep = actieveLijst === null ? "uitrusting" : "koffer";

  const zichtbaar = useMemo(
    () =>
      (items ?? []).filter((item) =>
        actieveLijst === null
          ? item.groep === "uitrusting"
          : item.groep === "koffer" && item.travelerId === actieveLijst,
      ),
    [items, actieveLijst],
  );

  const percentage =
    zichtbaar.length === 0
      ? 0
      : Math.round((zichtbaar.filter((item) => item.afgevinkt).length / zichtbaar.length) * 100);

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

  async function wisselAfvinken(item: PackItem): Promise<void> {
    // Direct in beeld bijwerken; de api volgt. Bij een fout zetten we terug.
    const vorige = items ?? [];
    setItems(vorige.map((r) => (r.id === item.id ? { ...r, afgevinkt: !r.afgevinkt } : r)));
    try {
      await api.inpaklijst.werkBij(item.id, { afgevinkt: !item.afgevinkt });
    } catch (error) {
      setItems(vorige);
      setFout((error as Error).message);
    }
  }

  if (fout !== null && items === null) return <Melding tekst={fout} />;
  if (items === null) return <Laden />;

  return (
    <div className="space-y-4">
      {/* Schakelaar: uitrusting + één knop per reiziger. */}
      <div
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
        role="tablist"
        aria-label="Kies een lijst"
      >
        <LijstKnop
          actief={actieveLijst === null}
          onClick={() => setActieveLijst(null)}
          label="Uitrusting"
        />
        {reizigers.map((reiziger) => (
          <LijstKnop
            key={reiziger.id}
            actief={actieveLijst === reiziger.id}
            onClick={() => setActieveLijst(reiziger.id)}
            label={reiziger.naam}
          />
        ))}
      </div>

      {fout !== null && <Melding tekst={fout} onSluit={() => setFout(null)} />}

      <Kaart>
        <VoortgangsBalk
          percentage={percentage}
          label={
            actieveLijst === null
              ? "Uitrusting"
              : `Koffer van ${reizigers.find((r) => r.id === actieveLijst)?.naam ?? ""}`
          }
        />
        <p className="mt-2 text-xs text-slate">
          {zichtbaar.filter((item) => item.afgevinkt).length} van {zichtbaar.length} klaar
        </p>
      </Kaart>

      {zichtbaar.length === 0 ? (
        <Kaart>
          <LegeStaat
            titel={actieveLijst === null ? "Nog geen uitrusting" : "Nog geen koffer"}
            uitnodiging={
              actieveLijst === null
                ? "Begin met de standaardlijst: tent, haringen, gasfles en de rest."
                : "Voeg toe wat er in deze koffer moet, of begin met de standaardlijst."
            }
            actie={
              <Knop
                soort="primair"
                disabled={bezig}
                onClick={() =>
                  void metFout(async () => {
                    const resultaat = await api.inpaklijst.standaardlijst(
                      tripId,
                      groep,
                      actieveLijst,
                    );
                    setItems([...(items ?? []), ...resultaat.items]);
                  })
                }
              >
                Standaardlijst toevoegen
              </Knop>
            }
          />
        </Kaart>
      ) : (
        <Kaart className="p-0">
          <ul className="divide-y divide-slate/12">
            {zichtbaar.map((item) => (
              <li key={item.id} className="flex items-center gap-2 px-2 py-1">
                {herschrijft === item.id ? (
                  <div className="flex w-full items-center gap-2 py-1.5">
                    <input
                      className={INVOER_STIJL}
                      value={herschrevenLabel}
                      onChange={(event) => setHerschrevenLabel(event.target.value)}
                      aria-label="Nieuwe naam voor dit item"
                      autoFocus
                    />
                    <Knop
                      soort="primair"
                      disabled={bezig || herschrevenLabel.trim() === ""}
                      onClick={() =>
                        void metFout(async () => {
                          const bijgewerkt = await api.inpaklijst.werkBij(item.id, {
                            label: herschrevenLabel.trim(),
                          });
                          setItems((items ?? []).map((r) => (r.id === item.id ? bijgewerkt : r)));
                          setHerschrijft(null);
                        })
                      }
                    >
                      Opslaan
                    </Knop>
                    <Knop soort="stil" onClick={() => setHerschrijft(null)}>
                      Terug
                    </Knop>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void wisselAfvinken(item)}
                      aria-pressed={item.afgevinkt}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-canvas"
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
                      onClick={() => {
                        setHerschrijft(item.id);
                        setHerschrevenLabel(item.label);
                      }}
                      aria-label={`${item.label} herschrijven`}
                      className="shrink-0 rounded-lg px-2 py-2 text-xs text-slate hover:bg-canvas hover:text-ink"
                    >
                      Herschrijf
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void metFout(async () => {
                          await api.inpaklijst.verwijder(item.id);
                          setItems((items ?? []).filter((r) => r.id !== item.id));
                        })
                      }
                      aria-label={`${item.label} verwijderen`}
                      className="shrink-0 rounded-lg px-2 py-2 text-xs text-slate hover:bg-alert/8 hover:text-alert"
                    >
                      Weg
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Kaart>
      )}

      {/* Item toevoegen. Geen <form>: een onClick-handler doet het werk. */}
      <Kaart>
        <div className="flex gap-2">
          <input
            className={INVOER_STIJL}
            placeholder="Wat gaat er nog mee?"
            value={nieuwLabel}
            aria-label="Nieuw item"
            onChange={(event) => setNieuwLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && nieuwLabel.trim() !== "") {
                event.preventDefault();
                void voegToe();
              }
            }}
          />
          <Knop soort="primair" disabled={bezig || nieuwLabel.trim() === ""} onClick={voegToe}>
            Voeg toe
          </Knop>
        </div>
      </Kaart>

      <div className="flex flex-col gap-2">
        <Knop
          breed
          disabled={bezig}
          onClick={() =>
            void metFout(async () => {
              const resultaat = await api.inpaklijst.standaardlijst(tripId, groep, actieveLijst);
              setItems([...(items ?? []), ...resultaat.items]);
            })
          }
        >
          Standaardlijst toevoegen
        </Knop>

        {vraagWissen ? (
          <Bevestiging
            vraag="Alle vinkjes wissen?"
            toelichting="De items blijven staan, alleen de vinkjes gaan eraf."
            bevestigLabel="Wis de vinkjes"
            onAnnuleer={() => setVraagWissen(false)}
            onBevestig={() =>
              void metFout(async () => {
                await api.inpaklijst.wisVinkjes(tripId);
                setItems((items ?? []).map((item) => ({ ...item, afgevinkt: false })));
                setVraagWissen(false);
              })
            }
          />
        ) : (
          <Knop breed soort="stil" onClick={() => setVraagWissen(true)}>
            Wis alle vinkjes
          </Knop>
        )}
      </div>
    </div>
  );

  async function voegToe(): Promise<void> {
    if (nieuwLabel.trim() === "") return;
    await metFout(async () => {
      const nieuw = await api.inpaklijst.voegToe(tripId, groep, actieveLijst, nieuwLabel.trim());
      setItems([...(items ?? []), nieuw]);
      setNieuwLabel("");
    });
  }
}

function LijstKnop({
  actief,
  onClick,
  label,
}: {
  actief: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={actief}
      onClick={onClick}
      className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
        actief ? "bg-amber text-navy" : "bg-white text-slate hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
