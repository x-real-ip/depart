import { useState } from "react";
import {
  Bevestiging,
  INVOER_STIJL,
  Kaart,
  KaartKop,
  Knop,
  Melding,
  Veld,
} from "../components/ui.tsx";
import { api, type TripMetReizigers } from "../lib/api.ts";
import { BEKENDE_LANDEN } from "../lib/format.ts";

/** Reis bewerken, reizigers beheren, reis verwijderen met bevestiging. */
export function Instellingen({
  trip,
  onBijgewerkt,
  onVerwijderd,
}: {
  trip: TripMetReizigers;
  onBijgewerkt: () => void;
  onVerwijderd: () => void;
}) {
  const [naam, setNaam] = useState(trip.naam);
  const [bestemming, setBestemming] = useState(trip.bestemming);
  const [land, setLand] = useState(trip.land);
  const [regio, setRegio] = useState(trip.regio ?? "");
  const [vertrekdatum, setVertrekdatum] = useState(trip.vertrekdatum);
  const [terugdatum, setTerugdatum] = useState(trip.terugdatum);
  const [campingNaam, setCampingNaam] = useState(trip.campingNaam ?? "");
  const [plaatsnummer, setPlaatsnummer] = useState(trip.plaatsnummer ?? "");
  const [plaatsInfo, setPlaatsInfo] = useState(trip.plaatsInfo ?? "");
  const [afstandKm, setAfstandKm] = useState(trip.afstandKm?.toString() ?? "");
  const [rijtijdMin, setRijtijdMin] = useState(trip.rijtijdMin?.toString() ?? "");
  const [tolKosten, setTolKosten] = useState(trip.tolKosten?.toString() ?? "");

  const [nieuweReiziger, setNieuweReiziger] = useState("");
  const [nieuwGeboortejaar, setNieuwGeboortejaar] = useState("");
  const [teVerwijderenReiziger, setTeVerwijderenReiziger] = useState<string | null>(null);
  const [vraagVerwijderen, setVraagVerwijderen] = useState(false);

  const [fout, setFout] = useState<string | null>(null);
  const [bewaard, setBewaard] = useState(false);
  const [bezig, setBezig] = useState(false);

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

  function getal(waarde: string): number | null {
    const opgeschoond = waarde.replace(",", ".").trim();
    return opgeschoond === "" ? null : Number(opgeschoond);
  }

  return (
    <div className="space-y-4">
      {fout !== null && <Melding tekst={fout} onSluit={() => setFout(null)} />}

      <Kaart className="space-y-3">
        <KaartKop>De reis</KaartKop>

        <Veld label="Naam">
          <input
            className={INVOER_STIJL}
            value={naam}
            onChange={(event) => setNaam(event.target.value)}
          />
        </Veld>

        <div className="grid grid-cols-2 gap-3">
          <Veld label="Bestemming">
            <input
              className={INVOER_STIJL}
              value={bestemming}
              onChange={(event) => setBestemming(event.target.value)}
            />
          </Veld>
          <Veld label="Land">
            <select
              className={INVOER_STIJL}
              value={BEKENDE_LANDEN.includes(land) ? land : ""}
              onChange={(event) => setLand(event.target.value)}
            >
              {!BEKENDE_LANDEN.includes(land) && <option value="">{land}</option>}
              {BEKENDE_LANDEN.map((naamVanLand) => (
                <option key={naamVanLand} value={naamVanLand}>
                  {naamVanLand}
                </option>
              ))}
            </select>
          </Veld>
        </div>

        <Veld label="Regio">
          <input
            className={INVOER_STIJL}
            value={regio}
            onChange={(event) => setRegio(event.target.value)}
          />
        </Veld>

        <div className="grid grid-cols-2 gap-3">
          <Veld label="Vertrek">
            <input
              type="date"
              className={INVOER_STIJL}
              value={vertrekdatum}
              onChange={(event) => setVertrekdatum(event.target.value)}
            />
          </Veld>
          <Veld label="Terug">
            <input
              type="date"
              className={INVOER_STIJL}
              min={vertrekdatum}
              value={terugdatum}
              onChange={(event) => setTerugdatum(event.target.value)}
            />
          </Veld>
        </div>
      </Kaart>

      <Kaart className="space-y-3">
        <KaartKop>Camping</KaartKop>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Veld label="Naam">
            <input
              className={INVOER_STIJL}
              value={campingNaam}
              onChange={(event) => setCampingNaam(event.target.value)}
            />
          </Veld>
          <Veld label="Plaats">
            <input
              className={`${INVOER_STIJL} w-24`}
              value={plaatsnummer}
              onChange={(event) => setPlaatsnummer(event.target.value)}
            />
          </Veld>
        </div>
        <Veld label="Over de plek">
          <input
            className={INVOER_STIJL}
            placeholder="Schaduw, bij het water"
            value={plaatsInfo}
            onChange={(event) => setPlaatsInfo(event.target.value)}
          />
        </Veld>
      </Kaart>

      <Kaart className="space-y-3">
        <KaartKop>De rit</KaartKop>
        <div className="grid grid-cols-3 gap-3">
          <Veld label="Afstand km">
            <input
              className={INVOER_STIJL}
              inputMode="numeric"
              value={afstandKm}
              onChange={(event) => setAfstandKm(event.target.value.replace(/[^\d]/g, ""))}
            />
          </Veld>
          <Veld label="Rijtijd min">
            <input
              className={INVOER_STIJL}
              inputMode="numeric"
              value={rijtijdMin}
              onChange={(event) => setRijtijdMin(event.target.value.replace(/[^\d]/g, ""))}
            />
          </Veld>
          <Veld label="Tol euro">
            <input
              className={INVOER_STIJL}
              inputMode="decimal"
              value={tolKosten}
              onChange={(event) => setTolKosten(event.target.value.replace(/[^\d,.]/g, ""))}
            />
          </Veld>
        </div>
      </Kaart>

      <div className="flex items-center gap-3">
        <Knop
          soort="primair"
          breed
          disabled={bezig || naam.trim() === "" || bestemming.trim() === ""}
          onClick={() =>
            void metFout(async () => {
              await api.trips.werkBij(trip.id, {
                naam: naam.trim(),
                bestemming: bestemming.trim(),
                land: land.trim(),
                regio: regio.trim() === "" ? null : regio.trim(),
                vertrekdatum,
                terugdatum,
                campingNaam: campingNaam.trim() === "" ? null : campingNaam.trim(),
                plaatsnummer: plaatsnummer.trim() === "" ? null : plaatsnummer.trim(),
                plaatsInfo: plaatsInfo.trim() === "" ? null : plaatsInfo.trim(),
                afstandKm: getal(afstandKm),
                rijtijdMin: getal(rijtijdMin),
                tolKosten: getal(tolKosten),
              });
              onBijgewerkt();
              setBewaard(true);
              window.setTimeout(() => setBewaard(false), 2500);
            })
          }
        >
          Bewaar de wijzigingen
        </Knop>
        {bewaard && (
          <span className="label-mono shrink-0 text-forest" role="status">
            bewaard
          </span>
        )}
      </div>

      <Kaart className="space-y-2">
        <KaartKop>Reizigers</KaartKop>
        <ul className="divide-y divide-slate/12">
          {trip.reizigers.map((reiziger) => (
            <li key={reiziger.id} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">
                  {reiziger.naam}
                </span>
                {reiziger.geboortejaar !== null && (
                  <span className="label-mono block text-slate">{reiziger.geboortejaar}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setTeVerwijderenReiziger(reiziger.id)}
                aria-label={`${reiziger.naam} verwijderen`}
                className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-slate hover:bg-alert/8 hover:text-alert"
              >
                Weg
              </button>
            </li>
          ))}
        </ul>

        {teVerwijderenReiziger !== null && (
          <Bevestiging
            vraag={`${trip.reizigers.find((r) => r.id === teVerwijderenReiziger)?.naam ?? "Deze reiziger"} verwijderen?`}
            toelichting="De koffer en de persoonlijke documenten van deze reiziger gaan mee, inclusief de geüploade bestanden."
            bevestigLabel="Verwijder"
            onAnnuleer={() => setTeVerwijderenReiziger(null)}
            onBevestig={() =>
              void metFout(async () => {
                await api.reizigers.verwijder(teVerwijderenReiziger);
                setTeVerwijderenReiziger(null);
                onBijgewerkt();
              })
            }
          />
        )}

        <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-slate/12 pt-3">
          <Veld label="Naam">
            <input
              className={INVOER_STIJL}
              placeholder="Nieuwe reiziger"
              value={nieuweReiziger}
              onChange={(event) => setNieuweReiziger(event.target.value)}
            />
          </Veld>
          <Veld label="Geboren">
            <input
              className={`${INVOER_STIJL} w-24`}
              inputMode="numeric"
              placeholder="2016"
              value={nieuwGeboortejaar}
              onChange={(event) =>
                setNieuwGeboortejaar(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
          </Veld>
        </div>
        <Knop
          breed
          disabled={bezig || nieuweReiziger.trim() === ""}
          onClick={() =>
            void metFout(async () => {
              await api.reizigers.voegToe(
                trip.id,
                nieuweReiziger.trim(),
                nieuwGeboortejaar === "" ? null : Number(nieuwGeboortejaar),
              );
              setNieuweReiziger("");
              setNieuwGeboortejaar("");
              onBijgewerkt();
            })
          }
        >
          Reiziger toevoegen
        </Knop>
      </Kaart>

      {vraagVerwijderen ? (
        <Bevestiging
          vraag={`De reis "${trip.naam}" verwijderen?`}
          toelichting="Alle reizigers, documenten, inpaklijsten, etappes en noodnummers gaan mee. De geüploade bestanden worden ook van schijf gehaald. Dit kun je niet ongedaan maken."
          bevestigLabel="Verwijder de reis"
          onAnnuleer={() => setVraagVerwijderen(false)}
          onBevestig={() =>
            void metFout(async () => {
              await api.trips.verwijder(trip.id);
              onVerwijderd();
            })
          }
        />
      ) : (
        <Knop breed soort="waarschuwing" onClick={() => setVraagVerwijderen(true)}>
          Deze reis verwijderen
        </Knop>
      )}
    </div>
  );
}
