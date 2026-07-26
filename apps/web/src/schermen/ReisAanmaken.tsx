import { useState } from "react";
import { INVOER_STIJL, Kaart, Knop, Melding, Veld } from "../components/ui.tsx";
import { api, type TripMetReizigers } from "../lib/api.ts";
import { BEKENDE_LANDEN } from "../lib/format.ts";

interface NieuweReiziger {
  naam: string;
  geboortejaar: string;
}

/**
 * Het startscherm bij een lege app, en ook het scherm om een tweede reis toe te
 * voegen. Geen <form> met submit-navigatie: een onClick-handler slaat op.
 */
export function ReisAanmaken({
  onKlaar,
  onAnnuleer,
}: {
  onKlaar: (trip: TripMetReizigers) => void;
  onAnnuleer?: () => void;
}) {
  const [naam, setNaam] = useState("");
  const [bestemming, setBestemming] = useState("");
  const [land, setLand] = useState("Frankrijk");
  const [regio, setRegio] = useState("");
  const [vertrekdatum, setVertrekdatum] = useState("");
  const [terugdatum, setTerugdatum] = useState("");
  const [campingNaam, setCampingNaam] = useState("");
  const [plaatsnummer, setPlaatsnummer] = useState("");
  const [reizigers, setReizigers] = useState<NieuweReiziger[]>([{ naam: "", geboortejaar: "" }]);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const compleet =
    naam.trim() !== "" &&
    bestemming.trim() !== "" &&
    land.trim() !== "" &&
    vertrekdatum !== "" &&
    terugdatum !== "";

  async function bewaar(): Promise<void> {
    setBezig(true);
    setFout(null);
    try {
      const trip = await api.trips.maak({
        naam: naam.trim(),
        bestemming: bestemming.trim(),
        land: land.trim(),
        regio: regio.trim() === "" ? null : regio.trim(),
        vertrekdatum,
        terugdatum,
        campingNaam: campingNaam.trim() === "" ? null : campingNaam.trim(),
        plaatsnummer: plaatsnummer.trim() === "" ? null : plaatsnummer.trim(),
        reizigers: reizigers
          .filter((reiziger) => reiziger.naam.trim() !== "")
          .map((reiziger) => ({
            naam: reiziger.naam.trim(),
            geboortejaar: reiziger.geboortejaar === "" ? null : Number(reiziger.geboortejaar),
          })),
      });
      onKlaar(trip);
    } catch (error) {
      setFout((error as Error).message);
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="font-display text-2xl font-extrabold text-ink">Waar gaan we heen?</h1>
        <p className="mt-1 text-sm text-slate">
          Vul de reis in. De inpaklijst, documenten en etappes komen daarna.
        </p>
      </header>

      {fout !== null && <Melding tekst={fout} onSluit={() => setFout(null)} />}

      <Kaart className="space-y-3">
        <Veld label="Naam van de reis">
          <input
            className={INVOER_STIJL}
            placeholder="Zomer 2026"
            value={naam}
            onChange={(event) => setNaam(event.target.value)}
          />
        </Veld>

        <div className="grid grid-cols-2 gap-3">
          <Veld label="Bestemming">
            <input
              className={INVOER_STIJL}
              placeholder="Annecy"
              value={bestemming}
              onChange={(event) => setBestemming(event.target.value)}
            />
          </Veld>
          <Veld label="Land">
            <select
              className={INVOER_STIJL}
              value={land}
              onChange={(event) => setLand(event.target.value)}
            >
              {BEKENDE_LANDEN.map((naamVanLand) => (
                <option key={naamVanLand} value={naamVanLand}>
                  {naamVanLand}
                </option>
              ))}
            </select>
          </Veld>
        </div>

        <Veld label="Regio" hint="Mag leeg blijven.">
          <input
            className={INVOER_STIJL}
            placeholder="Haute-Savoie"
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
              min={vertrekdatum === "" ? undefined : vertrekdatum}
              value={terugdatum}
              onChange={(event) => setTerugdatum(event.target.value)}
            />
          </Veld>
        </div>
      </Kaart>

      <Kaart className="space-y-3">
        <h2 className="label-mono text-slate">Camping</h2>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Veld label="Naam">
            <input
              className={INVOER_STIJL}
              placeholder="Camping Le Belvedere"
              value={campingNaam}
              onChange={(event) => setCampingNaam(event.target.value)}
            />
          </Veld>
          <Veld label="Plaats">
            <input
              className={`${INVOER_STIJL} w-24`}
              placeholder="B14"
              value={plaatsnummer}
              onChange={(event) => setPlaatsnummer(event.target.value)}
            />
          </Veld>
        </div>
      </Kaart>

      <Kaart className="space-y-3">
        <h2 className="label-mono text-slate">Wie gaan er mee?</h2>
        {reizigers.map((reiziger, index) => (
          <div key={index} className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
            <Veld label={`Reiziger ${index + 1}`}>
              <input
                className={INVOER_STIJL}
                placeholder="Naam"
                value={reiziger.naam}
                onChange={(event) =>
                  setReizigers(
                    reizigers.map((r, i) => (i === index ? { ...r, naam: event.target.value } : r)),
                  )
                }
              />
            </Veld>
            <Veld label="Geboren">
              <input
                className={`${INVOER_STIJL} w-24`}
                inputMode="numeric"
                placeholder="1985"
                value={reiziger.geboortejaar}
                onChange={(event) =>
                  setReizigers(
                    reizigers.map((r, i) =>
                      i === index
                        ? { ...r, geboortejaar: event.target.value.replace(/\D/g, "").slice(0, 4) }
                        : r,
                    ),
                  )
                }
              />
            </Veld>
            <button
              type="button"
              onClick={() => setReizigers(reizigers.filter((_, i) => i !== index))}
              disabled={reizigers.length === 1}
              aria-label={`Reiziger ${index + 1} verwijderen`}
              className="mb-1 rounded-lg px-2 py-2 text-xs text-slate hover:bg-alert/8 hover:text-alert disabled:opacity-30"
            >
              Weg
            </button>
          </div>
        ))}
        <Knop
          soort="stil"
          onClick={() => setReizigers([...reizigers, { naam: "", geboortejaar: "" }])}
        >
          Nog een reiziger
        </Knop>
      </Kaart>

      <div className="flex gap-2">
        <Knop soort="primair" breed disabled={bezig || !compleet} onClick={bewaar}>
          {bezig ? "Bezig…" : "Maak de reis aan"}
        </Knop>
        {onAnnuleer !== undefined && (
          <Knop soort="stil" onClick={onAnnuleer}>
            Terug
          </Knop>
        )}
      </div>
    </div>
  );
}
