import { useEffect, useState } from "react";
import {
  INVOER_STIJL,
  Kaart,
  KaartKop,
  Knop,
  Laden,
  LegeStaat,
  Melding,
  Veld,
} from "../components/ui.tsx";
import { api, type Contact, type Stop, type Trip } from "../lib/api.ts";
import { afstand, bedrag, rijtijd, verplichtInDeAuto } from "../lib/format.ts";

export function Onderweg({ trip }: { trip: Trip }) {
  const [etappes, setEtappes] = useState<Stop[] | null>(null);
  const [nummers, setNummers] = useState<Contact[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const [nieuwePlaats, setNieuwePlaats] = useState("");
  const [nieuweTijd, setNieuweTijd] = useState("");
  const [nieuweOpmerking, setNieuweOpmerking] = useState("");
  const [bewerkt, setBewerkt] = useState<string | null>(null);

  const [nieuwLabel, setNieuwLabel] = useState("");
  const [nieuwNummer, setNieuwNummer] = useState("");

  // Welke etappe wordt op dit moment versleept.
  const [gesleept, setGesleept] = useState<string | null>(null);

  useEffect(() => {
    let actueel = true;
    Promise.all([api.etappes.lijst(trip.id), api.noodnummers.lijst(trip.id)])
      .then(([stops, contacts]) => {
        if (!actueel) return;
        setEtappes(stops);
        setNummers(contacts);
      })
      .catch((error: Error) => {
        if (actueel) setFout(error.message);
      });
    return () => {
      actueel = false;
    };
  }, [trip.id]);

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

  /** Verplaatst een etappe naar een nieuwe plek en slaat de volgorde op. */
  async function verplaats(vanId: string, naarId: string): Promise<void> {
    const huidig = etappes ?? [];
    const vanIndex = huidig.findIndex((etappe) => etappe.id === vanId);
    const naarIndex = huidig.findIndex((etappe) => etappe.id === naarId);
    if (vanIndex === -1 || naarIndex === -1 || vanIndex === naarIndex) return;

    const nieuw = [...huidig];
    const [verplaatst] = nieuw.splice(vanIndex, 1);
    nieuw.splice(naarIndex, 0, verplaatst!);
    setEtappes(nieuw);

    try {
      const opgeslagen = await api.etappes.herorden(
        trip.id,
        nieuw.map((etappe) => etappe.id),
      );
      setEtappes(opgeslagen);
    } catch (error) {
      setEtappes(huidig);
      setFout((error as Error).message);
    }
  }

  if (fout !== null && etappes === null) return <Melding tekst={fout} />;
  if (etappes === null || nummers === null) return <Laden />;

  return (
    <div className="space-y-4">
      {fout !== null && <Melding tekst={fout} onSluit={() => setFout(null)} />}

      {/* Afstand, rijtijd en tolkosten bovenaan. */}
      <Kaart>
        <dl className="grid grid-cols-3 gap-3">
          <div>
            <dt className="label-mono text-slate">afstand</dt>
            <dd className="mt-0.5 font-mono text-lg font-semibold text-ink">
              {afstand(trip.afstandKm)}
            </dd>
          </div>
          <div>
            <dt className="label-mono text-slate">rijtijd</dt>
            <dd className="mt-0.5 font-mono text-lg font-semibold text-ink">
              {rijtijd(trip.rijtijdMin)}
            </dd>
          </div>
          <div>
            <dt className="label-mono text-slate">tol</dt>
            <dd className="mt-0.5 font-mono text-lg font-semibold text-ink">
              {bedrag(trip.tolKosten)}
            </dd>
          </div>
        </dl>
      </Kaart>

      {/* Etappes, te verslepen om te sorteren. */}
      <Kaart className="p-0">
        <div className="px-4 pt-4">
          <KaartKop
            extra={
              etappes.length > 1 ? (
                <span className="text-xs text-slate">Versleep om te sorteren</span>
              ) : undefined
            }
          >
            Etappes
          </KaartKop>
        </div>

        {etappes.length === 0 ? (
          <LegeStaat
            titel="Nog geen etappes"
            uitnodiging="Zet je eerste stop erin, bijvoorbeeld waar je gaat tanken."
          />
        ) : (
          <ol className="divide-y divide-slate/12">
            {etappes.map((etappe, index) => (
              <li
                key={etappe.id}
                draggable={bewerkt === null}
                onDragStart={() => setGesleept(etappe.id)}
                onDragEnd={() => setGesleept(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (gesleept !== null) void verplaats(gesleept, etappe.id);
                  setGesleept(null);
                }}
                className={`px-4 py-3 ${gesleept === etappe.id ? "opacity-45" : ""}`}
              >
                {bewerkt === etappe.id ? (
                  <EtappeFormulier
                    beginPlaats={etappe.plaats}
                    beginTijd={etappe.tijd ?? ""}
                    beginOpmerking={etappe.opmerking ?? ""}
                    bezig={bezig}
                    bevestigLabel="Opslaan"
                    onBevestig={(velden) =>
                      void metFout(async () => {
                        const bijgewerkt = await api.etappes.werkBij(etappe.id, velden);
                        setEtappes(
                          (etappes ?? []).map((e) => (e.id === etappe.id ? bijgewerkt : e)),
                        );
                        setBewerkt(null);
                      })
                    }
                    onAnnuleer={() => setBewerkt(null)}
                  />
                ) : (
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-navy font-mono text-xs font-semibold text-canvas"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{etappe.plaats}</p>
                      {etappe.opmerking !== null && (
                        <p className="mt-0.5 text-xs text-slate">{etappe.opmerking}</p>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-sm font-semibold text-ink">
                      {etappe.tijd ?? "—"}
                    </span>
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => setBewerkt(etappe.id)}
                        className="rounded px-1.5 py-0.5 text-xs text-slate hover:bg-canvas hover:text-ink"
                        aria-label={`Etappe ${etappe.plaats} bewerken`}
                      >
                        Bewerk
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void metFout(async () => {
                            await api.etappes.verwijder(etappe.id);
                            setEtappes((etappes ?? []).filter((e) => e.id !== etappe.id));
                          })
                        }
                        className="rounded px-1.5 py-0.5 text-xs text-slate hover:bg-alert/8 hover:text-alert"
                        aria-label={`Etappe ${etappe.plaats} verwijderen`}
                      >
                        Weg
                      </button>
                    </div>
                    {/* Verplaatsen met het toetsenbord, voor wie niet sleept. */}
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => void verplaats(etappe.id, etappes[index - 1]!.id)}
                        aria-label={`${etappe.plaats} naar boven`}
                        className="rounded px-1.5 text-slate hover:bg-canvas hover:text-ink disabled:opacity-25"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={index === etappes.length - 1}
                        onClick={() => void verplaats(etappe.id, etappes[index + 1]!.id)}
                        aria-label={`${etappe.plaats} naar beneden`}
                        className="rounded px-1.5 text-slate hover:bg-canvas hover:text-ink disabled:opacity-25"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        <div className="border-t border-slate/12 p-4">
          <EtappeFormulier
            beginPlaats={nieuwePlaats}
            beginTijd={nieuweTijd}
            beginOpmerking={nieuweOpmerking}
            bezig={bezig}
            bevestigLabel="Etappe toevoegen"
            onBevestig={(velden) =>
              void metFout(async () => {
                const nieuw = await api.etappes.voegToe(trip.id, velden);
                setEtappes([...(etappes ?? []), nieuw]);
                setNieuwePlaats("");
                setNieuweTijd("");
                setNieuweOpmerking("");
              })
            }
          />
        </div>
      </Kaart>

      {/* Verplicht in de auto, per land dat je doorkruist. */}
      <Kaart>
        <KaartKop>Verplicht in de auto — {trip.land}</KaartKop>
        <ul className="space-y-1.5">
          {verplichtInDeAuto(trip.land).map((ding) => (
            <li key={ding} className="flex items-start gap-2 text-sm text-ink">
              <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-forest" />
              {ding}
            </li>
          ))}
        </ul>
      </Kaart>

      {/* Noodnummers als grote knoppen met tel:-link. */}
      <Kaart>
        <KaartKop>Noodnummers</KaartKop>
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
                    <span className="label-mono block text-canvas/70">
                      {nummer.telefoonnummer}
                    </span>
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
                  trip.id,
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
    </div>
  );
}

/** Formulier voor één etappe, gebruikt voor toevoegen én bewerken. */
function EtappeFormulier({
  beginPlaats,
  beginTijd,
  beginOpmerking,
  bezig,
  bevestigLabel,
  onBevestig,
  onAnnuleer,
}: {
  beginPlaats: string;
  beginTijd: string;
  beginOpmerking: string;
  bezig: boolean;
  bevestigLabel: string;
  onBevestig: (velden: { plaats: string; tijd: string | null; opmerking: string | null }) => void;
  onAnnuleer?: () => void;
}) {
  const [plaats, setPlaats] = useState(beginPlaats);
  const [tijd, setTijd] = useState(beginTijd);
  const [opmerking, setOpmerking] = useState(beginOpmerking);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Veld label="Plaats">
          <input
            className={INVOER_STIJL}
            placeholder="Metz"
            value={plaats}
            onChange={(event) => setPlaats(event.target.value)}
          />
        </Veld>
        <Veld label="Tijd">
          <input
            type="time"
            className={INVOER_STIJL}
            value={tijd}
            onChange={(event) => setTijd(event.target.value)}
          />
        </Veld>
      </div>
      <Veld label="Opmerking">
        <input
          className={INVOER_STIJL}
          placeholder="Tanken en lunch"
          value={opmerking}
          onChange={(event) => setOpmerking(event.target.value)}
        />
      </Veld>
      <div className="flex gap-2">
        <Knop
          soort="primair"
          disabled={bezig || plaats.trim() === ""}
          onClick={() => {
            onBevestig({
              plaats: plaats.trim(),
              tijd: tijd === "" ? null : tijd,
              opmerking: opmerking.trim() === "" ? null : opmerking.trim(),
            });
            if (onAnnuleer === undefined) {
              setPlaats("");
              setTijd("");
              setOpmerking("");
            }
          }}
        >
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
