import { useEffect, useMemo, useState } from "react";
import {
  Bevestiging,
  INVOER_STIJL,
  Kaart,
  Knop,
  Laden,
  LegeStaat,
  Melding,
  Veld,
  VoortgangsBalk,
} from "../components/ui.tsx";
import { api, type PackItem, type PackList, type Traveler } from "../lib/api.ts";

/**
 * Eigen inpaklijsten: elke lijst heeft een naam die je zelf kiest — Uitrusting,
 * Boodschappen, Fotografie, wat dan ook — en mag optioneel bij één reiziger
 * horen. Onbeperkt lijsten, onbeperkt items per lijst.
 */
export function Inpaklijst({
  tripId,
  reizigers,
}: {
  tripId: string;
  reizigers: Traveler[];
}) {
  const [lijsten, setLijsten] = useState<PackList[] | null>(null);
  const [items, setItems] = useState<PackItem[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [actieveLijstId, setActieveLijstId] = useState<string | null>(null);
  const [nieuwLabel, setNieuwLabel] = useState("");
  const [herschrijft, setHerschrijft] = useState<string | null>(null);
  const [herschrevenLabel, setHerschrevenLabel] = useState("");
  const [vraagWissen, setVraagWissen] = useState(false);
  const [vraagVerwijderLijst, setVraagVerwijderLijst] = useState(false);
  const [nieuweLijstOpen, setNieuweLijstOpen] = useState(false);
  const [nieuweLijstNaam, setNieuweLijstNaam] = useState("");
  const [nieuweLijstReiziger, setNieuweLijstReiziger] = useState("");
  const [herschrijftLijstNaam, setHerschrijftLijstNaam] = useState(false);
  const [lijstNaamInvoer, setLijstNaamInvoer] = useState("");
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    let actueel = true;
    Promise.all([api.inpaklijsten.lijst(tripId), api.inpaklijstItems.lijst(tripId)])
      .then(([lijstenResultaat, itemsResultaat]) => {
        if (!actueel) return;
        setLijsten(lijstenResultaat);
        setItems(itemsResultaat);
        setActieveLijstId((huidig) => huidig ?? lijstenResultaat[0]?.id ?? null);
      })
      .catch((error: Error) => {
        if (actueel) setFout(error.message);
      });
    return () => {
      actueel = false;
    };
  }, [tripId]);

  // De gekozen lijst kan verdwenen zijn nadat hij verwijderd is.
  useEffect(() => {
    if (lijsten === null) return;
    if (actieveLijstId !== null && !lijsten.some((lijst) => lijst.id === actieveLijstId)) {
      setActieveLijstId(lijsten[0]?.id ?? null);
    }
  }, [actieveLijstId, lijsten]);

  const actieveLijst = lijsten?.find((lijst) => lijst.id === actieveLijstId) ?? null;

  const zichtbaar = useMemo(
    () => (items ?? []).filter((item) => item.packListId === actieveLijstId),
    [items, actieveLijstId],
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
      await api.inpaklijstItems.werkBij(item.id, { afgevinkt: !item.afgevinkt });
    } catch (error) {
      setItems(vorige);
      setFout((error as Error).message);
    }
  }

  async function voegToe(): Promise<void> {
    if (nieuwLabel.trim() === "" || actieveLijstId === null) return;
    await metFout(async () => {
      const nieuw = await api.inpaklijstItems.voegToe(actieveLijstId, nieuwLabel.trim());
      setItems([...(items ?? []), nieuw]);
      setNieuwLabel("");
    });
  }

  async function maakLijst(): Promise<void> {
    if (nieuweLijstNaam.trim() === "") return;
    await metFout(async () => {
      const nieuw = await api.inpaklijsten.maak(
        tripId,
        nieuweLijstNaam.trim(),
        nieuweLijstReiziger === "" ? null : nieuweLijstReiziger,
      );
      setLijsten([...(lijsten ?? []), nieuw]);
      setActieveLijstId(nieuw.id);
      setNieuweLijstOpen(false);
      setNieuweLijstNaam("");
      setNieuweLijstReiziger("");
    });
  }

  if (fout !== null && lijsten === null) return <Melding tekst={fout} />;
  if (lijsten === null || items === null) return <Laden />;

  return (
    <div className="space-y-4">
      {lijsten.length > 0 && (
        <div
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
          role="tablist"
          aria-label="Kies een inpaklijst"
        >
          {lijsten.map((lijst) => (
            <LijstKnop
              key={lijst.id}
              actief={actieveLijstId === lijst.id}
              onClick={() => setActieveLijstId(lijst.id)}
              label={lijst.naam}
            />
          ))}
          <button
            type="button"
            onClick={() => setNieuweLijstOpen(true)}
            className="shrink-0 rounded-xl border border-dashed border-slate/35 px-3.5 py-2 text-sm font-semibold text-slate hover:border-slate/60 hover:text-ink"
          >
            + Nieuwe lijst
          </button>
        </div>
      )}

      {fout !== null && <Melding tekst={fout} onSluit={() => setFout(null)} />}

      {nieuweLijstOpen && (
        <Kaart className="space-y-3">
          <h2 className="font-display text-lg font-extrabold text-ink">Nieuwe inpaklijst</h2>
          <Veld label="Naam" verplicht ingevuld={nieuweLijstNaam.trim() !== ""}>
            <input
              className={INVOER_STIJL}
              placeholder="Boodschappen"
              value={nieuweLijstNaam}
              autoFocus
              onChange={(event) => setNieuweLijstNaam(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && nieuweLijstNaam.trim() !== "") {
                  event.preventDefault();
                  void maakLijst();
                }
              }}
            />
          </Veld>
          {reizigers.length > 0 && (
            <Veld label="Hoort bij" hint="Optioneel.">
              <select
                className={INVOER_STIJL}
                value={nieuweLijstReiziger}
                onChange={(event) => setNieuweLijstReiziger(event.target.value)}
              >
                <option value="">Niemand specifiek</option>
                {reizigers.map((reiziger) => (
                  <option key={reiziger.id} value={reiziger.id}>
                    {reiziger.naam}
                  </option>
                ))}
              </select>
            </Veld>
          )}
          <div className="flex gap-2">
            <Knop
              soort="primair"
              disabled={bezig || nieuweLijstNaam.trim() === ""}
              onClick={maakLijst}
            >
              Lijst aanmaken
            </Knop>
            <Knop
              soort="stil"
              onClick={() => {
                setNieuweLijstOpen(false);
                setNieuweLijstNaam("");
                setNieuweLijstReiziger("");
              }}
            >
              Terug
            </Knop>
          </div>
        </Kaart>
      )}

      {lijsten.length === 0 && !nieuweLijstOpen ? (
        <Kaart>
          <LegeStaat
            titel="Nog geen inpaklijsten"
            uitnodiging="Maak je eerste lijst, bijvoorbeeld Uitrusting of Boodschappen."
            actie={
              <Knop soort="primair" onClick={() => setNieuweLijstOpen(true)}>
                Maak een inpaklijst
              </Knop>
            }
          />
        </Kaart>
      ) : (
        actieveLijst !== null && (
          <>
            <Kaart className="space-y-2">
              {herschrijftLijstNaam ? (
                <div className="flex items-center gap-2">
                  <input
                    className={INVOER_STIJL}
                    value={lijstNaamInvoer}
                    autoFocus
                    onChange={(event) => setLijstNaamInvoer(event.target.value)}
                    aria-label="Nieuwe naam voor deze lijst"
                  />
                  <Knop
                    soort="primair"
                    disabled={bezig || lijstNaamInvoer.trim() === ""}
                    onClick={() =>
                      void metFout(async () => {
                        const bijgewerkt = await api.inpaklijsten.werkBij(actieveLijst.id, {
                          naam: lijstNaamInvoer.trim(),
                        });
                        setLijsten(
                          (lijsten ?? []).map((l) => (l.id === bijgewerkt.id ? bijgewerkt : l)),
                        );
                        setHerschrijftLijstNaam(false);
                      })
                    }
                  >
                    Opslaan
                  </Knop>
                  <Knop soort="stil" onClick={() => setHerschrijftLijstNaam(false)}>
                    Terug
                  </Knop>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setHerschrijftLijstNaam(true);
                      setLijstNaamInvoer(actieveLijst.naam);
                    }}
                    className="min-w-0 flex-1 truncate rounded-lg px-1 py-0.5 text-left font-display text-lg font-extrabold text-ink hover:bg-canvas"
                    aria-label={`${actieveLijst.naam} hernoemen`}
                  >
                    {actieveLijst.naam}
                  </button>
                  {actieveLijst.travelerId !== null && (
                    <span className="label-mono shrink-0 rounded-full bg-forest/12 px-2 py-1 text-forest">
                      {reizigers.find((r) => r.id === actieveLijst.travelerId)?.naam ?? ""}
                    </span>
                  )}
                </div>
              )}

              <VoortgangsBalk percentage={percentage} />
              <p className="text-xs text-slate">
                {zichtbaar.filter((item) => item.afgevinkt).length} van {zichtbaar.length} klaar
              </p>
            </Kaart>

            {zichtbaar.length === 0 ? (
              <Kaart>
                <LegeStaat
                  titel="Nog leeg"
                  uitnodiging="Voeg toe wat er op deze lijst moet, of begin met een standaardlijst."
                  actie={
                    <div className="flex flex-wrap justify-center gap-2">
                      <Knop
                        soort="primair"
                        disabled={bezig}
                        onClick={() =>
                          void metFout(async () => {
                            const resultaat = await api.inpaklijsten.standaardlijst(
                              actieveLijst.id,
                              "uitrusting",
                            );
                            setItems([...(items ?? []), ...resultaat.items]);
                          })
                        }
                      >
                        Kampeerspullen
                      </Knop>
                      <Knop
                        disabled={bezig}
                        onClick={() =>
                          void metFout(async () => {
                            const resultaat = await api.inpaklijsten.standaardlijst(
                              actieveLijst.id,
                              "persoonlijk",
                            );
                            setItems([...(items ?? []), ...resultaat.items]);
                          })
                        }
                      >
                        Persoonlijke spullen
                      </Knop>
                    </div>
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
                                const bijgewerkt = await api.inpaklijstItems.werkBij(item.id, {
                                  label: herschrevenLabel.trim(),
                                });
                                setItems(
                                  (items ?? []).map((r) => (r.id === item.id ? bijgewerkt : r)),
                                );
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
                                await api.inpaklijstItems.verwijder(item.id);
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
                  placeholder="Wat moet er nog bij?"
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
              {vraagWissen ? (
                <Bevestiging
                  vraag="Alle vinkjes in deze lijst wissen?"
                  toelichting="De items blijven staan, alleen de vinkjes gaan eraf."
                  bevestigLabel="Wis de vinkjes"
                  onAnnuleer={() => setVraagWissen(false)}
                  onBevestig={() =>
                    void metFout(async () => {
                      await api.inpaklijsten.wisVinkjes(actieveLijst.id);
                      setItems(
                        (items ?? []).map((item) =>
                          item.packListId === actieveLijst.id ? { ...item, afgevinkt: false } : item,
                        ),
                      );
                      setVraagWissen(false);
                    })
                  }
                />
              ) : (
                <Knop breed soort="stil" onClick={() => setVraagWissen(true)}>
                  Wis alle vinkjes
                </Knop>
              )}

              {vraagVerwijderLijst ? (
                <Bevestiging
                  vraag={`Lijst "${actieveLijst.naam}" verwijderen?`}
                  toelichting="Alle items op deze lijst gaan mee. Dit kun je niet ongedaan maken."
                  bevestigLabel="Verwijder de lijst"
                  onAnnuleer={() => setVraagVerwijderLijst(false)}
                  onBevestig={() =>
                    void metFout(async () => {
                      await api.inpaklijsten.verwijder(actieveLijst.id);
                      setLijsten((lijsten ?? []).filter((l) => l.id !== actieveLijst.id));
                      setItems((items ?? []).filter((item) => item.packListId !== actieveLijst.id));
                      setVraagVerwijderLijst(false);
                    })
                  }
                />
              ) : (
                <Knop breed soort="waarschuwing" onClick={() => setVraagVerwijderLijst(true)}>
                  Deze lijst verwijderen
                </Knop>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
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
