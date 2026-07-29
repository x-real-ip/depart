import { useEffect, useState } from "react";
import { AdresVeld } from "./AdresVeld.tsx";
import {
  Bevestiging,
  INVOER_STIJL,
  Kaart,
  KaartKop,
  Knop,
  Laden,
  LegeStaat,
  Melding,
  Veld,
} from "./ui.tsx";
import { api, type Destination, type NieuweDestination } from "../lib/api.ts";
import { BEKENDE_LANDEN, datumKort } from "../lib/format.ts";

/**
 * Bestemmingen: van thuis tot de eindbestemming, in volgorde. Dezelfde plek
 * kan een korte tussenstop zijn of een meerdaags verblijf — het verschil zit
 * alleen in wat er ingevuld is, niet in een apart soort. De laatste in de
 * lijst is de eindbestemming van de reis.
 *
 * Gedeeld tussen de instellingen (waar je de reis compleet maakt) en het
 * tabblad Onderweg (waar je een bestemming onderweg toevoegt) — het is
 * dezelfde lijst, gewoon op twee plekken te beheren.
 */
export function Bestemmingen({
  tripId,
  onGewijzigd,
}: {
  tripId: string;
  /** Roep aan na elke wijziging die de route/kaart kan raken. */
  onGewijzigd?: () => void;
}) {
  const [bestemmingen, setBestemmingen] = useState<Destination[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [bewerkt, setBewerkt] = useState<string | null>(null);
  const [nieuweOpen, setNieuweOpen] = useState(false);
  const [teVerwijderen, setTeVerwijderen] = useState<Destination | null>(null);
  const [gesleept, setGesleept] = useState<string | null>(null);

  useEffect(() => {
    let actueel = true;
    api.destinations
      .lijst(tripId)
      .then((resultaat) => {
        if (actueel) setBestemmingen(resultaat);
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

  /** Verplaatst een bestemming naar een nieuwe plek en slaat de volgorde op. */
  async function verplaats(vanId: string, naarId: string): Promise<void> {
    const huidig = bestemmingen ?? [];
    const vanIndex = huidig.findIndex((b) => b.id === vanId);
    const naarIndex = huidig.findIndex((b) => b.id === naarId);
    if (vanIndex === -1 || naarIndex === -1 || vanIndex === naarIndex) return;

    const nieuw = [...huidig];
    const [verplaatst] = nieuw.splice(vanIndex, 1);
    nieuw.splice(naarIndex, 0, verplaatst!);
    setBestemmingen(nieuw);

    try {
      const opgeslagen = await api.destinations.herorden(
        tripId,
        nieuw.map((b) => b.id),
      );
      setBestemmingen(opgeslagen);
      onGewijzigd?.();
    } catch (error) {
      setBestemmingen(huidig);
      setFout((error as Error).message);
    }
  }

  if (fout !== null && bestemmingen === null) return <Melding tekst={fout} />;
  if (bestemmingen === null) return <Laden />;

  return (
    <Kaart className="p-0">
      <div className="px-4 pt-4">
        <KaartKop
          extra={
            bestemmingen.length > 1 ? (
              <span className="text-xs text-slate">Versleep om te sorteren</span>
            ) : undefined
          }
        >
          Bestemmingen
        </KaartKop>
      </div>

      {fout !== null && (
        <div className="px-4 pb-2">
          <Melding tekst={fout} onSluit={() => setFout(null)} />
        </div>
      )}

      {bestemmingen.length === 0 && !nieuweOpen ? (
        <LegeStaat
          titel="Nog geen bestemmingen"
          uitnodiging="Voeg de plek toe waar je naartoe gaat — dat kan een camping zijn, een hotel onderweg, of een korte tussenstop."
          actie={
            <Knop soort="primair" onClick={() => setNieuweOpen(true)}>
              Bestemming toevoegen
            </Knop>
          }
        />
      ) : (
        <ol className="divide-y divide-slate/12">
          {bestemmingen.map((bestemming, index) => (
            <li
              key={bestemming.id}
              draggable={bewerkt === null}
              onDragStart={() => setGesleept(bestemming.id)}
              onDragEnd={() => setGesleept(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (gesleept !== null) void verplaats(gesleept, bestemming.id);
                setGesleept(null);
              }}
              className={`px-4 py-3 ${gesleept === bestemming.id ? "opacity-45" : ""}`}
            >
              {bewerkt === bestemming.id ? (
                <BestemmingFormulier
                  begin={bestemming}
                  bezig={bezig}
                  bevestigLabel="Opslaan"
                  onBevestig={(velden) =>
                    void metFout(async () => {
                      const bijgewerkt = await api.destinations.werkBij(bestemming.id, velden);
                      setBestemmingen(
                        (bestemmingen ?? []).map((b) => (b.id === bestemming.id ? bijgewerkt : b)),
                      );
                      setBewerkt(null);
                      onGewijzigd?.();
                    })
                  }
                  onAnnuleer={() => setBewerkt(null)}
                />
              ) : (
                <BestemmingRegel
                  bestemming={bestemming}
                  volgnummer={index + 1}
                  laatste={index === bestemmingen.length - 1}
                  vorige={index === 0 ? null : bestemmingen[index - 1]!}
                  volgende={index === bestemmingen.length - 1 ? null : bestemmingen[index + 1]!}
                  onBewerk={() => setBewerkt(bestemming.id)}
                  onVerwijder={() => setTeVerwijderen(bestemming)}
                  onVerplaats={(naarId) => void verplaats(bestemming.id, naarId)}
                />
              )}
            </li>
          ))}
        </ol>
      )}

      {teVerwijderen !== null && (
        <div className="px-4 pb-4">
          <Bevestiging
            vraag={`${teVerwijderen.naam ?? teVerwijderen.plaats} verwijderen?`}
            toelichting="Dit kun je niet ongedaan maken."
            bevestigLabel="Verwijder"
            onAnnuleer={() => setTeVerwijderen(null)}
            onBevestig={() =>
              void metFout(async () => {
                await api.destinations.verwijder(teVerwijderen.id);
                setBestemmingen((bestemmingen ?? []).filter((b) => b.id !== teVerwijderen.id));
                setTeVerwijderen(null);
                onGewijzigd?.();
              })
            }
          />
        </div>
      )}

      <div className="border-t border-slate/12 p-4">
        {nieuweOpen ? (
          <BestemmingFormulier
            bezig={bezig}
            bevestigLabel="Bestemming toevoegen"
            leegNa
            onBevestig={(velden) =>
              void metFout(async () => {
                const nieuw = await api.destinations.voegToe(tripId, velden);
                setBestemmingen([...(bestemmingen ?? []), nieuw]);
                onGewijzigd?.();
              })
            }
            onAnnuleer={bestemmingen.length === 0 ? undefined : () => setNieuweOpen(false)}
          />
        ) : (
          <Knop breed soort="stil" onClick={() => setNieuweOpen(true)}>
            Nieuwe bestemming
          </Knop>
        )}
      </div>
    </Kaart>
  );
}

function BestemmingRegel({
  bestemming,
  volgnummer,
  laatste,
  vorige,
  volgende,
  onBewerk,
  onVerwijder,
  onVerplaats,
}: {
  bestemming: Destination;
  volgnummer: number;
  laatste: boolean;
  vorige: Destination | null;
  volgende: Destination | null;
  onBewerk: () => void;
  onVerwijder: () => void;
  onVerplaats: (naarId: string) => void;
}) {
  const landRegio = [bestemming.regio, bestemming.land].filter(Boolean).join(", ");
  const heeftNaam = bestemming.naam !== null && bestemming.naam !== bestemming.plaats;

  return (
    <div className="flex items-start gap-3">
      {/* De hele bestemming is de bewerk-knop — net als een item in de
          inpaklijst of takenlijst is dit de voor de hand liggende plek om te
          tikken, niet een los "Bewerk"-linkje dat je makkelijk over het
          hoofd ziet. */}
      <button
        type="button"
        onClick={onBewerk}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-lg py-0.5 text-left transition-colors hover:bg-canvas"
        aria-label={`${bestemming.naam ?? bestemming.plaats} bewerken`}
      >
        <span
          aria-hidden="true"
          className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold ${
            bestemming.nachten !== null ? "bg-forest text-white" : "bg-navy text-canvas"
          }`}
        >
          {volgnummer}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-ink">
            {bestemming.naam ?? bestemming.plaats}
            {laatste && (
              <span className="label-mono rounded-full bg-navy/10 px-2 py-0.5 text-navy">
                eindbestemming
              </span>
            )}
            {bestemming.nachten !== null && (
              <span className="label-mono rounded-full bg-forest/12 px-2 py-0.5 text-forest">
                {bestemming.nachten === 1 ? "1 nacht" : `${bestemming.nachten} nachten`}
              </span>
            )}
          </p>
          {(heeftNaam || landRegio !== "") && (
            <p className="mt-0.5 truncate text-xs text-slate">
              {[heeftNaam ? bestemming.plaats : null, landRegio || null].filter(Boolean).join(" — ")}
            </p>
          )}
          {bestemming.adres !== null && (
            <p className="mt-0.5 truncate text-xs text-slate">{bestemming.adres}</p>
          )}
          {bestemming.opmerking !== null && (
            <p className="mt-0.5 text-xs text-slate">{bestemming.opmerking}</p>
          )}
        </div>
      </button>
      <span className="shrink-0 text-right font-mono text-xs text-ink">
        {bestemming.incheckdatum !== null ? (
          <>
            {datumKort(bestemming.incheckdatum)}
            {bestemming.uitcheckdatum !== null && ` – ${datumKort(bestemming.uitcheckdatum)}`}
          </>
        ) : (
          (bestemming.inchecktijd ?? "—")
        )}
      </span>
      <button
        type="button"
        onClick={onVerwijder}
        className="shrink-0 self-start rounded px-1.5 py-0.5 text-xs text-slate hover:bg-alert/8 hover:text-alert"
        aria-label={`${bestemming.naam ?? bestemming.plaats} verwijderen`}
      >
        Weg
      </button>
      {/* Verplaatsen met het toetsenbord, voor wie niet sleept. */}
      <div className="flex shrink-0 flex-col gap-0.5">
        <button
          type="button"
          disabled={vorige === null}
          onClick={() => vorige !== null && onVerplaats(vorige.id)}
          aria-label={`${bestemming.naam ?? bestemming.plaats} naar boven`}
          className="rounded px-1.5 text-slate hover:bg-canvas hover:text-ink disabled:opacity-25"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={volgende === null}
          onClick={() => volgende !== null && onVerplaats(volgende.id)}
          aria-label={`${bestemming.naam ?? bestemming.plaats} naar beneden`}
          className="rounded px-1.5 text-slate hover:bg-canvas hover:text-ink disabled:opacity-25"
        >
          ↓
        </button>
      </div>
    </div>
  );
}

/**
 * Formulier voor één bestemming, gebruikt voor toevoegen én bewerken. Alleen
 * plaats is verplicht — de rest staat achter "Meer details", zodat een
 * tussenstop net zo makkelijk blijft als voorheen.
 */
function BestemmingFormulier({
  begin,
  bezig,
  bevestigLabel,
  leegNa = false,
  onBevestig,
  onAnnuleer,
}: {
  begin?: Destination;
  bezig: boolean;
  bevestigLabel: string;
  /** Maak de velden leeg na opslaan; voor het toevoegformulier. */
  leegNa?: boolean;
  onBevestig: (velden: NieuweDestination) => void;
  onAnnuleer?: () => void;
}) {
  const [plaats, setPlaats] = useState(begin?.plaats ?? "");
  const [inchecktijd, setInchecktijd] = useState(begin?.inchecktijd ?? "");
  const [opmerking, setOpmerking] = useState(begin?.opmerking ?? "");

  const heeftDetails =
    begin !== undefined &&
    (begin.naam !== null ||
      begin.land !== null ||
      begin.regio !== null ||
      begin.adres !== null ||
      begin.plaatsnummer !== null ||
      begin.incheckdatum !== null ||
      begin.uitcheckdatum !== null ||
      begin.uitchecktijd !== null);
  const [meerDetails, setMeerDetails] = useState(heeftDetails);

  const [naam, setNaam] = useState(begin?.naam ?? "");
  const [land, setLand] = useState(begin?.land ?? "");
  const [regio, setRegio] = useState(begin?.regio ?? "");
  const [plaatsnummer, setPlaatsnummer] = useState(begin?.plaatsnummer ?? "");
  const [adres, setAdres] = useState(begin?.adres ?? "");
  const [incheckdatum, setIncheckdatum] = useState(begin?.incheckdatum ?? "");
  const [uitcheckdatum, setUitcheckdatum] = useState(begin?.uitcheckdatum ?? "");
  const [uitchecktijd, setUitchecktijd] = useState(begin?.uitchecktijd ?? "");

  // Alleen gevuld na een verse keuze uit de autocomplete in deze sessie —
  // anders blijven bestaande coördinaten gewoon staan (regelt de api zelf).
  const [coordVers, setCoordVers] = useState<{ lat: number; lon: number } | null>(null);
  const adresGeverifieerd =
    coordVers !== null || (adres === (begin?.adres ?? "") && (begin?.adresGeverifieerd ?? false));

  function bewaar(): void {
    onBevestig({
      plaats: plaats.trim(),
      inchecktijd: inchecktijd === "" ? null : inchecktijd,
      opmerking: opmerking.trim() === "" ? null : opmerking.trim(),
      naam: naam.trim() === "" ? null : naam.trim(),
      land: land === "" ? null : land,
      regio: regio.trim() === "" ? null : regio.trim(),
      plaatsnummer: plaatsnummer.trim() === "" ? null : plaatsnummer.trim(),
      adres: adres.trim() === "" ? null : adres.trim(),
      incheckdatum: incheckdatum === "" ? null : incheckdatum,
      uitcheckdatum: uitcheckdatum === "" ? null : uitcheckdatum,
      uitchecktijd: uitchecktijd === "" ? null : uitchecktijd,
      lat: coordVers?.lat,
      lon: coordVers?.lon,
    });
    if (leegNa) {
      setPlaats("");
      setInchecktijd("");
      setOpmerking("");
      setNaam("");
      setLand("");
      setRegio("");
      setPlaatsnummer("");
      setAdres("");
      setIncheckdatum("");
      setUitcheckdatum("");
      setUitchecktijd("");
      setCoordVers(null);
      setMeerDetails(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Veld label="Plaats" verplicht ingevuld={plaats.trim() !== ""}>
          <input
            className={INVOER_STIJL}
            placeholder="Metz"
            value={plaats}
            onChange={(event) => setPlaats(event.target.value)}
          />
        </Veld>
        <Veld label="Incheck" hint="Tijd">
          <input
            type="time"
            className={INVOER_STIJL}
            value={inchecktijd}
            onChange={(event) => setInchecktijd(event.target.value)}
          />
        </Veld>
      </div>

      <Veld label="Opmerking">
        <input
          className={INVOER_STIJL}
          placeholder="Sleutel ophalen bij de receptie"
          value={opmerking}
          onChange={(event) => setOpmerking(event.target.value)}
        />
      </Veld>

      <button
        type="button"
        onClick={() => setMeerDetails(!meerDetails)}
        aria-expanded={meerDetails}
        className="label-mono text-slate underline decoration-slate/40 underline-offset-2 hover:text-ink"
      >
        {meerDetails ? "Minder details" : "Meer details"}
      </button>

      {meerDetails && (
        <div className="space-y-2 rounded-xl border border-slate/15 bg-canvas/60 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Veld label="Naam" hint="Camping, hotel, wat dan ook.">
              <input
                className={INVOER_STIJL}
                placeholder="Camping Le Belvedere"
                value={naam}
                onChange={(event) => setNaam(event.target.value)}
              />
            </Veld>
            <Veld label="Nummer" hint="Plaats- of kamernummer.">
              <input
                className={INVOER_STIJL}
                placeholder="B14"
                value={plaatsnummer}
                onChange={(event) => setPlaatsnummer(event.target.value)}
              />
            </Veld>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Veld label="Land">
              <select
                className={INVOER_STIJL}
                value={land}
                onChange={(event) => setLand(event.target.value)}
              >
                <option value="">Geen land gekozen</option>
                {BEKENDE_LANDEN.map((naamVanLand) => (
                  <option key={naamVanLand} value={naamVanLand}>
                    {naamVanLand}
                  </option>
                ))}
              </select>
            </Veld>
            <Veld label="Regio">
              <input
                className={INVOER_STIJL}
                placeholder="Haute-Savoie"
                value={regio}
                onChange={(event) => setRegio(event.target.value)}
              />
            </Veld>
          </div>

          <AdresVeld
            label="Adres"
            hint="Kies een suggestie voor de route en de kaart."
            placeholder="Rue X 12"
            waarde={adres}
            geverifieerd={adresGeverifieerd}
            onWijzig={(tekst) => {
              setAdres(tekst);
              setCoordVers(null);
            }}
            onKies={(suggestie) => {
              setAdres(suggestie.label);
              setCoordVers({ lat: suggestie.lat, lon: suggestie.lon });
            }}
          />

          <div className="grid grid-cols-2 gap-2">
            <Veld label="Incheckdatum">
              <input
                type="date"
                className={INVOER_STIJL}
                value={incheckdatum}
                onChange={(event) => setIncheckdatum(event.target.value)}
              />
            </Veld>
            <Veld label="Uitcheckdatum">
              <input
                type="date"
                className={INVOER_STIJL}
                min={incheckdatum === "" ? undefined : incheckdatum}
                value={uitcheckdatum}
                onChange={(event) => setUitcheckdatum(event.target.value)}
              />
            </Veld>
          </div>
          <Veld label="Uitchecktijd">
            <input
              type="time"
              className={`${INVOER_STIJL} w-32`}
              value={uitchecktijd}
              onChange={(event) => setUitchecktijd(event.target.value)}
            />
          </Veld>
        </div>
      )}

      <div className="flex gap-2">
        <Knop soort="primair" disabled={bezig || plaats.trim() === ""} onClick={bewaar}>
          {bevestigLabel}
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
