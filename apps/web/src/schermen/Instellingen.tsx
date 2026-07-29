import { useEffect, useRef, useState } from "react";
import { AdresVeld } from "../components/AdresVeld.tsx";
import { Bestemmingen } from "../components/Bestemmingen.tsx";
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

/** Hoe lang na de laatste toets/keuze er pas bewaard wordt. */
const AUTOSAVE_VERTRAGING_MS = 700;

/**
 * Reis bewerken, reizigers beheren, reis verwijderen met bevestiging.
 *
 * Eerst alles wat bij vertrek hoort (De reis, Vertrek), dan de bestemmingen —
 * in die volgorde vul je een reis ook echt in: waar het begint, dan waar het
 * naartoe gaat, eventueel in meerdere etappes.
 *
 * Elk veld hier bewaart zichzelf: geen aparte knop, geen twijfel of een
 * wijziging al is opgeslagen. Afstand, rijtijd en tolkosten staan er expres
 * niet meer bij — die berekent de app zelf, op het tabblad Heenreis.
 */
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
  const [vertrekdatum, setVertrekdatum] = useState(trip.vertrekdatum);
  const [terugdatum, setTerugdatum] = useState(trip.terugdatum);

  const [thuisplaats, setThuisplaats] = useState(trip.thuisplaats ?? "");
  const [thuisland, setThuisland] = useState(trip.thuisland ?? "Nederland");
  const [thuisAdres, setThuisAdres] = useState(trip.thuisAdres ?? "");
  // Alleen gevuld als er in deze sessie een verse suggestie is gekozen — dat
  // is het enige moment waarop de app zelf coördinaten in handen heeft. Blijft
  // dit adres ongewijzigd, dan hoeven er geen nieuwe coördinaten mee: de
  // bestaande blijven gewoon staan.
  const [thuisCoordVers, setThuisCoordVers] = useState<{ lat: number; lon: number } | null>(null);
  const thuisGeverifieerd =
    thuisCoordVers !== null || (thuisAdres === (trip.thuisAdres ?? "") && trip.thuisAdresGeverifieerd);

  const [nieuweReiziger, setNieuweReiziger] = useState("");
  const [nieuwGeboortejaar, setNieuwGeboortejaar] = useState("");
  const [teVerwijderenReiziger, setTeVerwijderenReiziger] = useState<string | null>(null);
  const [vraagVerwijderen, setVraagVerwijderen] = useState(false);

  const [fout, setFout] = useState<string | null>(null);
  const [opgeslagen, setOpgeslagen] = useState(false);
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

  // Autosave: elke wijziging aan een van deze velden bewaart zichzelf, een
  // fractie van een seconde nadat je stopt met typen of een keuze maakt.
  // Bewust één en dezelfde weg voor elk veld — geen knop hier, geen andere
  // daar. De eerste render (bij het openen van dit scherm) slaat niets op,
  // anders zou elke reis meteen een overbodige aanroep krijgen.
  const eersteRender = useRef(true);
  useEffect(() => {
    if (eersteRender.current) {
      eersteRender.current = false;
      return;
    }
    if (naam.trim() === "") return;

    const timeout = window.setTimeout(() => {
      void metFout(async () => {
        await api.trips.werkBij(trip.id, {
          naam: naam.trim(),
          vertrekdatum,
          terugdatum,
          thuisplaats: thuisplaats.trim() === "" ? null : thuisplaats.trim(),
          thuisland: thuisland.trim() === "" ? null : thuisland.trim(),
          thuisAdres: thuisAdres.trim() === "" ? null : thuisAdres.trim(),
          // Alleen meesturen als er in deze sessie echt een nieuwe suggestie
          // gekozen is — anders blijven bestaande coördinaten gewoon staan
          // (of vervallen ze, als het adres wél veranderd is zonder nieuwe
          // keuze; dat regelt de api zelf).
          thuisLat: thuisCoordVers?.lat,
          thuisLon: thuisCoordVers?.lon,
        });
        onBijgewerkt();
        setOpgeslagen(true);
        window.setTimeout(() => setOpgeslagen(false), 2000);
      });
    }, AUTOSAVE_VERTRAGING_MS);

    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naam, vertrekdatum, terugdatum, thuisplaats, thuisland, thuisAdres, thuisCoordVers]);

  return (
    <div className="space-y-4">
      {fout !== null && <Melding tekst={fout} onSluit={() => setFout(null)} />}

      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-lg font-extrabold text-ink">Instellingen</h1>
        {/* Stille bevestiging, geen bewaarknop: elk veld slaat zichzelf op. */}
        {opgeslagen && (
          <span className="label-mono shrink-0 text-forest" role="status">
            opgeslagen
          </span>
        )}
      </div>

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

      {/* Waar de reis begint. Vertrekpunt voor de route en plaats voor het weer thuis. */}
      <Kaart className="space-y-3">
        <KaartKop>Vertrek</KaartKop>
        <div className="grid grid-cols-2 gap-3">
          <Veld
            label="Thuisplaats"
            verplicht
            ingevuld={thuisplaats.trim() !== ""}
            hint="Waar de reis begint."
          >
            <input
              className={INVOER_STIJL}
              placeholder="Utrecht"
              value={thuisplaats}
              onChange={(event) => setThuisplaats(event.target.value)}
            />
          </Veld>
          <Veld label="Land van thuis">
            <select
              className={INVOER_STIJL}
              value={BEKENDE_LANDEN.includes(thuisland) ? thuisland : ""}
              onChange={(event) => setThuisland(event.target.value)}
            >
              {!BEKENDE_LANDEN.includes(thuisland) && <option value="">{thuisland}</option>}
              {BEKENDE_LANDEN.map((naamVanLand) => (
                <option key={naamVanLand} value={naamVanLand}>
                  {naamVanLand}
                </option>
              ))}
            </select>
          </Veld>
        </div>

        <AdresVeld
          label="Preciezer thuisadres"
          hint="Optioneel. Voor een nauwkeurigere route en op de kaart."
          placeholder="Kerkstraat 12, Utrecht"
          waarde={thuisAdres}
          geverifieerd={thuisGeverifieerd}
          onWijzig={(tekst) => {
            setThuisAdres(tekst);
            setThuisCoordVers(null);
          }}
          onKies={(suggestie) => {
            setThuisAdres(suggestie.label);
            setThuisCoordVers({ lat: suggestie.lat, lon: suggestie.lon });
          }}
        />
      </Kaart>

      {/* Bestemmingen: van thuis tot de eindbestemming, zelf toe te voegen. */}
      <Bestemmingen tripId={trip.id} onGewijzigd={onBijgewerkt} />

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
            toelichting="Inpaklijsten en documenten die bij deze reiziger horen gaan mee, inclusief de geüploade bestanden."
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
          toelichting="Alle reizigers, documenten, inpaklijsten, bestemmingen en noodnummers gaan mee. De geüploade bestanden worden ook van schijf gehaald. Dit kun je niet ongedaan maken."
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
