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
} from "../components/ui.tsx";
import { api, type PackList, type Recipe, type RecipeIngredient } from "../lib/api.ts";

/** Waarde in de lijstkeuze die "maak een nieuwe lijst" betekent, in plaats van een echt id. */
const NIEUWE_LIJST = "__nieuw__";

/**
 * Gerechten voor op de camping: een naam en een vaste ingrediëntenlijst. De
 * ingrediënten zelf zijn geen boodschappenlijst — dat wordt een inpaklijst
 * pas als je op "Zet op een lijst" drukt. Daarna staan de items op zichzelf:
 * wijzig je het gerecht later, dan verandert de inpaklijst niet mee, en
 * andersom.
 */
export function Gerechten({ tripId }: { tripId: string }) {
  const [gerechten, setGerechten] = useState<Recipe[] | null>(null);
  const [ingredienten, setIngredienten] = useState<RecipeIngredient[] | null>(null);
  const [lijsten, setLijsten] = useState<PackList[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [actiefId, setActiefId] = useState<string | null>(null);
  const [nieuwGerechtOpen, setNieuwGerechtOpen] = useState(false);
  const [nieuweGerechtNaam, setNieuweGerechtNaam] = useState("");
  const [herschrijftNaam, setHerschrijftNaam] = useState(false);
  const [naamInvoer, setNaamInvoer] = useState("");
  const [nieuwIngredient, setNieuwIngredient] = useState("");
  const [vraagVerwijderen, setVraagVerwijderen] = useState(false);
  const [gekozenLijst, setGekozenLijst] = useState("");
  const [nieuweLijstNaam, setNieuweLijstNaam] = useState("");
  const [overzetMelding, setOverzetMelding] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    let actueel = true;
    Promise.all([
      api.gerechten.lijst(tripId),
      api.ingredienten.lijst(tripId),
      api.inpaklijsten.lijst(tripId),
    ])
      .then(([recepten, alleIngredienten, packLists]) => {
        if (!actueel) return;
        setGerechten(recepten);
        setIngredienten(alleIngredienten);
        setLijsten(packLists);
        setActiefId((huidig) => huidig ?? recepten[0]?.id ?? null);
      })
      .catch((error: Error) => {
        if (actueel) setFout(error.message);
      });
    return () => {
      actueel = false;
    };
  }, [tripId]);

  useEffect(() => {
    if (gerechten === null) return;
    if (actiefId !== null && !gerechten.some((gerecht) => gerecht.id === actiefId)) {
      setActiefId(gerechten[0]?.id ?? null);
    }
  }, [actiefId, gerechten]);

  const actiefGerecht = gerechten?.find((gerecht) => gerecht.id === actiefId) ?? null;

  const zichtbareIngredienten = useMemo(
    () => (ingredienten ?? []).filter((i) => i.recipeId === actiefId),
    [ingredienten, actiefId],
  );

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

  async function maakGerecht(): Promise<void> {
    if (nieuweGerechtNaam.trim() === "") return;
    await metFout(async () => {
      const nieuw = await api.gerechten.maak(tripId, nieuweGerechtNaam.trim());
      setGerechten([...(gerechten ?? []), nieuw]);
      setActiefId(nieuw.id);
      setNieuwGerechtOpen(false);
      setNieuweGerechtNaam("");
      setOverzetMelding(null);
    });
  }

  async function voegIngredientToe(): Promise<void> {
    if (nieuwIngredient.trim() === "" || actiefId === null) return;
    await metFout(async () => {
      const nieuw = await api.ingredienten.voegToe(actiefId, nieuwIngredient.trim());
      setIngredienten([...(ingredienten ?? []), nieuw]);
      setNieuwIngredient("");
    });
  }

  async function zetOpLijst(): Promise<void> {
    if (actiefGerecht === null) return;
    if (gekozenLijst === "" || (gekozenLijst === NIEUWE_LIJST && nieuweLijstNaam.trim() === "")) {
      return;
    }
    await metFout(async () => {
      const lijst =
        gekozenLijst === NIEUWE_LIJST
          ? await api.inpaklijsten.maak(tripId, nieuweLijstNaam.trim(), null)
          : (lijsten ?? []).find((l) => l.id === gekozenLijst);
      if (lijst === undefined) return;

      if (gekozenLijst === NIEUWE_LIJST) {
        setLijsten([...(lijsten ?? []), lijst]);
        setGekozenLijst(lijst.id);
        setNieuweLijstNaam("");
      }

      const resultaat = await api.gerechten.naarInpaklijst(actiefGerecht.id, lijst.id);
      setOverzetMelding(
        resultaat.overgeslagen === 0
          ? `${resultaat.toegevoegd} ${resultaat.toegevoegd === 1 ? "ingrediënt" : "ingrediënten"} op "${lijst.naam}" gezet.`
          : `${resultaat.toegevoegd} toegevoegd aan "${lijst.naam}", ${resultaat.overgeslagen} stonden er al op.`,
      );
    });
  }

  if (fout !== null && gerechten === null) return <Melding tekst={fout} />;
  if (gerechten === null || ingredienten === null || lijsten === null) return <Laden />;

  return (
    <div className="space-y-4">
      {gerechten.length > 0 && (
        <div
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
          role="tablist"
          aria-label="Kies een gerecht"
        >
          {gerechten.map((gerecht) => (
            <button
              key={gerecht.id}
              type="button"
              role="tab"
              aria-selected={actiefId === gerecht.id}
              onClick={() => {
                setActiefId(gerecht.id);
                setOverzetMelding(null);
              }}
              className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
                actiefId === gerecht.id ? "bg-amber text-navy" : "bg-white text-slate hover:text-ink"
              }`}
            >
              {gerecht.naam}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setNieuwGerechtOpen(true)}
            className="shrink-0 rounded-xl border border-dashed border-slate/35 px-3.5 py-2 text-sm font-semibold text-slate hover:border-slate/60 hover:text-ink"
          >
            + Nieuw gerecht
          </button>
        </div>
      )}

      {fout !== null && <Melding tekst={fout} onSluit={() => setFout(null)} />}

      {nieuwGerechtOpen && (
        <Kaart className="space-y-3">
          <h2 className="font-display text-lg font-extrabold text-ink">Nieuw gerecht</h2>
          <Veld label="Naam" verplicht ingevuld={nieuweGerechtNaam.trim() !== ""}>
            <input
              className={INVOER_STIJL}
              placeholder="Chili sin carne"
              value={nieuweGerechtNaam}
              autoFocus
              onChange={(event) => setNieuweGerechtNaam(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && nieuweGerechtNaam.trim() !== "") {
                  event.preventDefault();
                  void maakGerecht();
                }
              }}
            />
          </Veld>
          <div className="flex gap-2">
            <Knop
              soort="primair"
              disabled={bezig || nieuweGerechtNaam.trim() === ""}
              onClick={maakGerecht}
            >
              Gerecht aanmaken
            </Knop>
            <Knop
              soort="stil"
              onClick={() => {
                setNieuwGerechtOpen(false);
                setNieuweGerechtNaam("");
              }}
            >
              Terug
            </Knop>
          </div>
        </Kaart>
      )}

      {gerechten.length === 0 && !nieuwGerechtOpen ? (
        <Kaart>
          <LegeStaat
            titel="Nog geen gerechten"
            uitnodiging="Zet je vaste kampeermaaltijden op met hun ingrediënten, en stuur die later in één keer naar de boodschappenlijst."
            actie={
              <Knop soort="primair" onClick={() => setNieuwGerechtOpen(true)}>
                Maak een gerecht
              </Knop>
            }
          />
        </Kaart>
      ) : (
        actiefGerecht !== null && (
          <>
            <Kaart className="space-y-2">
              {herschrijftNaam ? (
                <div className="flex items-center gap-2">
                  <input
                    className={INVOER_STIJL}
                    value={naamInvoer}
                    autoFocus
                    onChange={(event) => setNaamInvoer(event.target.value)}
                    aria-label="Nieuwe naam voor dit gerecht"
                  />
                  <Knop
                    soort="primair"
                    disabled={bezig || naamInvoer.trim() === ""}
                    onClick={() =>
                      void metFout(async () => {
                        const bijgewerkt = await api.gerechten.werkBij(actiefGerecht.id, {
                          naam: naamInvoer.trim(),
                        });
                        setGerechten(
                          (gerechten ?? []).map((g) => (g.id === bijgewerkt.id ? bijgewerkt : g)),
                        );
                        setHerschrijftNaam(false);
                      })
                    }
                  >
                    Opslaan
                  </Knop>
                  <Knop soort="stil" onClick={() => setHerschrijftNaam(false)}>
                    Terug
                  </Knop>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setHerschrijftNaam(true);
                    setNaamInvoer(actiefGerecht.naam);
                  }}
                  className="rounded-lg px-1 py-0.5 text-left font-display text-lg font-extrabold text-ink hover:bg-canvas"
                  aria-label={`${actiefGerecht.naam} hernoemen`}
                >
                  {actiefGerecht.naam}
                </button>
              )}
              <p className="text-xs text-slate">
                {zichtbareIngredienten.length}{" "}
                {zichtbareIngredienten.length === 1 ? "ingrediënt" : "ingrediënten"}
              </p>
            </Kaart>

            {zichtbareIngredienten.length === 0 ? (
              <Kaart>
                <LegeStaat
                  titel="Nog geen ingrediënten"
                  uitnodiging="Voeg toe wat er in dit gerecht gaat."
                />
              </Kaart>
            ) : (
              <Kaart className="p-0">
                <ul className="divide-y divide-slate/12">
                  {zichtbareIngredienten.map((ingredient) => (
                    <li key={ingredient.id} className="flex items-center gap-2 px-2 py-1">
                      <span className="min-w-0 flex-1 truncate px-2 py-2 text-sm text-ink">
                        {ingredient.label}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          void metFout(async () => {
                            await api.ingredienten.verwijder(ingredient.id);
                            setIngredienten((ingredienten ?? []).filter((i) => i.id !== ingredient.id));
                          })
                        }
                        aria-label={`${ingredient.label} verwijderen`}
                        className="shrink-0 rounded-lg px-2 py-2 text-xs text-slate hover:bg-alert/8 hover:text-alert"
                      >
                        Weg
                      </button>
                    </li>
                  ))}
                </ul>
              </Kaart>
            )}

            {/* Ingrediënt toevoegen. Geen <form>: een onClick-handler doet het werk. */}
            <Kaart>
              <div className="flex gap-2">
                <input
                  className={INVOER_STIJL}
                  placeholder="Wat gaat erin?"
                  value={nieuwIngredient}
                  aria-label="Nieuw ingrediënt"
                  onChange={(event) => setNieuwIngredient(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && nieuwIngredient.trim() !== "") {
                      event.preventDefault();
                      void voegIngredientToe();
                    }
                  }}
                />
                <Knop
                  soort="primair"
                  disabled={bezig || nieuwIngredient.trim() === ""}
                  onClick={voegIngredientToe}
                >
                  Voeg toe
                </Knop>
              </div>
            </Kaart>

            {/* Ingrediënten naar een inpaklijst sturen: een eenmalige actie,
                daarna staan de items op zichzelf op die lijst. */}
            {zichtbareIngredienten.length > 0 && (
              <Kaart className="space-y-3">
                <h2 className="label-mono text-slate">Zet op een lijst</h2>
                <Veld label="Inpaklijst">
                  <select
                    className={INVOER_STIJL}
                    value={gekozenLijst}
                    onChange={(event) => {
                      setGekozenLijst(event.target.value);
                      setOverzetMelding(null);
                    }}
                  >
                    <option value="">Kies een lijst…</option>
                    {lijsten.map((lijst) => (
                      <option key={lijst.id} value={lijst.id}>
                        {lijst.naam}
                      </option>
                    ))}
                    <option value={NIEUWE_LIJST}>+ Nieuwe lijst…</option>
                  </select>
                </Veld>
                {gekozenLijst === NIEUWE_LIJST && (
                  <Veld label="Naam van de nieuwe lijst">
                    <input
                      className={INVOER_STIJL}
                      placeholder="Boodschappen"
                      value={nieuweLijstNaam}
                      autoFocus
                      onChange={(event) => setNieuweLijstNaam(event.target.value)}
                    />
                  </Veld>
                )}
                <Knop
                  soort="primair"
                  disabled={
                    bezig ||
                    gekozenLijst === "" ||
                    (gekozenLijst === NIEUWE_LIJST && nieuweLijstNaam.trim() === "")
                  }
                  onClick={zetOpLijst}
                >
                  Zet ingrediënten op deze lijst
                </Knop>
                {overzetMelding !== null && <p className="text-xs text-slate">{overzetMelding}</p>}
              </Kaart>
            )}

            {vraagVerwijderen ? (
              <Bevestiging
                vraag={`Gerecht "${actiefGerecht.naam}" verwijderen?`}
                toelichting="De ingrediënten van dit gerecht gaan mee. Dit kun je niet ongedaan maken."
                bevestigLabel="Verwijder het gerecht"
                onAnnuleer={() => setVraagVerwijderen(false)}
                onBevestig={() =>
                  void metFout(async () => {
                    await api.gerechten.verwijder(actiefGerecht.id);
                    setGerechten((gerechten ?? []).filter((g) => g.id !== actiefGerecht.id));
                    setIngredienten(
                      (ingredienten ?? []).filter((i) => i.recipeId !== actiefGerecht.id),
                    );
                    setVraagVerwijderen(false);
                    setOverzetMelding(null);
                  })
                }
              />
            ) : (
              <Knop breed soort="waarschuwing" onClick={() => setVraagVerwijderen(true)}>
                Dit gerecht verwijderen
              </Knop>
            )}
          </>
        )
      )}
    </div>
  );
}
