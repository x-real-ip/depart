import { useEffect, useRef, useState } from "react";
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
import { api, type DocumentItem, type DocumentStatus, type Traveler } from "../lib/api.ts";
import { bestandsgrootte, datumLang } from "../lib/format.ts";

const STATUS_STIJL: Record<DocumentStatus, string> = {
  ontbreekt: "bg-alert/10 text-alert",
  "let op": "bg-amber/20 text-navy",
  geldig: "bg-forest/12 text-forest",
};

/** Toegestane bestandstypen; de api controleert dit nog eens op de inhoud. */
const TOEGESTAAN = ".pdf,.jpg,.jpeg,.png,.heic";

export function Documenten({ tripId, reizigers }: { tripId: string; reizigers: Traveler[] }) {
  const [documenten, setDocumenten] = useState<DocumentItem[] | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [voegToeOpen, setVoegToeOpen] = useState(false);
  const [teVerwijderen, setTeVerwijderen] = useState<DocumentItem | null>(null);

  const [nieuwType, setNieuwType] = useState("");
  const [nieuwEigenType, setNieuwEigenType] = useState("");
  const [nieuwTravelerId, setNieuwTravelerId] = useState("");
  const [nieuwGeldigTot, setNieuwGeldigTot] = useState("");

  useEffect(() => {
    let actueel = true;
    Promise.all([api.documenten.lijst(tripId), api.documenten.types()])
      .then(([lijst, typeLijst]) => {
        if (!actueel) return;
        setDocumenten(lijst);
        setTypes(typeLijst);
        setNieuwType(typeLijst[0] ?? "");
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

  if (fout !== null && documenten === null) return <Melding tekst={fout} />;
  if (documenten === null) return <Laden />;

  const naamVan = (travelerId: string | null): string =>
    travelerId === null
      ? "Gezin of auto"
      : (reizigers.find((reiziger) => reiziger.id === travelerId)?.naam ?? "Onbekend");

  return (
    <div className="space-y-4">
      {fout !== null && <Melding tekst={fout} onSluit={() => setFout(null)} />}

      {documenten.length === 0 ? (
        <Kaart>
          <LegeStaat
            titel="Nog geen documenten"
            uitnodiging="Voeg je paspoort toe om te beginnen."
            actie={
              <div className="flex flex-col gap-2">
                <Knop
                  soort="primair"
                  disabled={bezig}
                  onClick={() =>
                    void metFout(async () => {
                      const resultaat = await api.documenten.standaardtypes(tripId);
                      setDocumenten(resultaat.documenten);
                    })
                  }
                >
                  Zet de standaardtypes klaar
                </Knop>
                <Knop soort="stil" onClick={() => setVoegToeOpen(true)}>
                  Of voeg er zelf een toe
                </Knop>
              </div>
            }
          />
        </Kaart>
      ) : (
        <Kaart className="p-0">
          <ul className="divide-y divide-slate/12">
            {documenten.map((document) => (
              <DocumentRegel
                key={document.id}
                document={document}
                bijWie={naamVan(document.travelerId)}
                bezig={bezig}
                onUpload={(bestand) =>
                  void metFout(async () => {
                    const bijgewerkt = await api.documenten.uploadBestand(document.id, bestand);
                    setDocumenten(
                      documenten.map((d) => (d.id === document.id ? bijgewerkt : d)),
                    );
                  })
                }
                onBestandWeg={() =>
                  void metFout(async () => {
                    const bijgewerkt = await api.documenten.verwijderBestand(document.id);
                    setDocumenten(
                      documenten.map((d) => (d.id === document.id ? bijgewerkt : d)),
                    );
                  })
                }
                onVerwijder={() => setTeVerwijderen(document)}
                onFout={setFout}
              />
            ))}
          </ul>
        </Kaart>
      )}

      {teVerwijderen !== null && (
        <Bevestiging
          vraag={`${teVerwijderen.type} verwijderen?`}
          toelichting={
            teVerwijderen.heeftBestand
              ? "Het geüploade bestand gaat ook van schijf. Dit kun je niet ongedaan maken."
              : "Dit kun je niet ongedaan maken."
          }
          bevestigLabel="Verwijder"
          onAnnuleer={() => setTeVerwijderen(null)}
          onBevestig={() =>
            void metFout(async () => {
              await api.documenten.verwijder(teVerwijderen.id);
              setDocumenten(documenten.filter((d) => d.id !== teVerwijderen.id));
              setTeVerwijderen(null);
            })
          }
        />
      )}

      {voegToeOpen ? (
        <Kaart className="space-y-3">
          <h2 className="font-display text-lg font-extrabold text-ink">Document toevoegen</h2>

          <Veld label="Type">
            <select
              className={INVOER_STIJL}
              value={nieuwType}
              onChange={(event) => setNieuwType(event.target.value)}
            >
              {types.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
              <option value="__eigen">Iets anders…</option>
            </select>
          </Veld>

          {nieuwType === "__eigen" && (
            <Veld label="Eigen type">
              <input
                className={INVOER_STIJL}
                value={nieuwEigenType}
                placeholder="Bijvoorbeeld: visvergunning"
                onChange={(event) => setNieuwEigenType(event.target.value)}
              />
            </Veld>
          )}

          <Veld label="Hoort bij">
            <select
              className={INVOER_STIJL}
              value={nieuwTravelerId}
              onChange={(event) => setNieuwTravelerId(event.target.value)}
            >
              <option value="">Gezin of auto</option>
              {reizigers.map((reiziger) => (
                <option key={reiziger.id} value={reiziger.id}>
                  {reiziger.naam}
                </option>
              ))}
            </select>
          </Veld>

          <Veld label="Geldig tot" hint="Leeg laten als het niet verloopt.">
            <input
              type="date"
              className={INVOER_STIJL}
              value={nieuwGeldigTot}
              onChange={(event) => setNieuwGeldigTot(event.target.value)}
            />
          </Veld>

          <div className="flex gap-2">
            <Knop
              soort="primair"
              disabled={bezig || (nieuwType === "__eigen" && nieuwEigenType.trim() === "")}
              onClick={() =>
                void metFout(async () => {
                  const nieuw = await api.documenten.maak(tripId, {
                    type: nieuwType === "__eigen" ? nieuwEigenType.trim() : nieuwType,
                    travelerId: nieuwTravelerId === "" ? null : nieuwTravelerId,
                    geldigTot: nieuwGeldigTot === "" ? null : nieuwGeldigTot,
                  });
                  setDocumenten([...documenten, nieuw]);
                  setVoegToeOpen(false);
                  setNieuwEigenType("");
                  setNieuwGeldigTot("");
                  setNieuwTravelerId("");
                })
              }
            >
              Voeg toe
            </Knop>
            <Knop soort="stil" onClick={() => setVoegToeOpen(false)}>
              Terug
            </Knop>
          </div>
        </Kaart>
      ) : (
        <div className="flex flex-col gap-2">
          <Knop breed soort="primair" onClick={() => setVoegToeOpen(true)}>
            Document toevoegen
          </Knop>
          {documenten.length > 0 && (
            <Knop
              breed
              soort="stil"
              disabled={bezig}
              onClick={() =>
                void metFout(async () => {
                  const resultaat = await api.documenten.standaardtypes(tripId);
                  if (resultaat.toegevoegd > 0) {
                    setDocumenten([...documenten, ...resultaat.documenten]);
                  }
                })
              }
            >
              Vul de standaardtypes aan
            </Knop>
          )}
        </div>
      )}
    </div>
  );
}

function DocumentRegel({
  document: doc,
  bijWie,
  bezig,
  onUpload,
  onBestandWeg,
  onVerwijder,
  onFout,
}: {
  document: DocumentItem;
  bijWie: string;
  bezig: boolean;
  onUpload: (bestand: File) => void;
  onBestandWeg: () => void;
  onVerwijder: () => void;
  onFout: (melding: string) => void;
}) {
  const bestandKiezer = useRef<HTMLInputElement>(null);

  /**
   * Het bestand wordt als blob opgehaald en in een nieuw tabblad geopend. Een
   * gewone link zou de Authorization-header niet meesturen.
   */
  async function bekijk(): Promise<void> {
    try {
      const url = await api.documenten.bestandBlobUrl(doc.id);
      window.open(url, "_blank", "noopener");
      // De blob mag pas vrij zodra het tabblad hem geladen heeft.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      onFout((error as Error).message);
    }
  }

  return (
    <li className="px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{doc.type}</p>
          <p className="label-mono mt-0.5 text-slate">{bijWie}</p>
          <p className="mt-1 text-xs text-slate">
            {doc.geldigTot === null ? "Geen einddatum" : `Geldig tot ${datumLang(doc.geldigTot)}`}
            {doc.heeftBestand && doc.grootte !== null && ` · ${bestandsgrootte(doc.grootte)}`}
          </p>
        </div>
        <span
          className={`label-mono shrink-0 rounded-full px-2.5 py-1 ${STATUS_STIJL[doc.status]}`}
        >
          {doc.status}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {/* De echte bestandskiezer blijft verborgen; de knop bedient hem. */}
        <input
          ref={bestandKiezer}
          type="file"
          accept={TOEGESTAAN}
          className="hidden"
          onChange={(event) => {
            const bestand = event.target.files?.[0];
            if (bestand) onUpload(bestand);
            // Leegmaken, anders vuurt onChange niet bij hetzelfde bestand.
            event.target.value = "";
          }}
        />
        <Knop soort="secundair" disabled={bezig} onClick={() => bestandKiezer.current?.click()}>
          {doc.heeftBestand ? "Vervang bestand" : "Upload bestand"}
        </Knop>
        {doc.heeftBestand && (
          <>
            <Knop soort="stil" onClick={() => void bekijk()}>
              Bekijk
            </Knop>
            <Knop soort="stil" disabled={bezig} onClick={onBestandWeg}>
              Haal bestand weg
            </Knop>
          </>
        )}
        <Knop soort="stil" onClick={onVerwijder}>
          Verwijder
        </Knop>
      </div>
    </li>
  );
}
