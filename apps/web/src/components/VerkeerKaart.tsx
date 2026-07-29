import { useState } from "react";
import { Landkaart } from "./Landkaart.tsx";
import { Kaart, KaartKop } from "./ui.tsx";
import { REDEN_TEKST, type VerkeerAntwoord } from "../lib/api.ts";

const INCIDENT_KLEUR: Record<string, string> = {
  onbekend: "bg-slate/12 text-slate",
  gering: "bg-slate/12 text-slate",
  matig: "bg-amber/20 text-navy",
  ernstig: "bg-alert/10 text-alert",
  "zeer ernstig": "bg-alert/10 text-alert",
};

/** uu:mm in de eigen tijdzone — genoeg detail voor "sinds" en "tot". */
function incidentTijd(iso: string): string {
  return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Files, ongelukken en wegwerkzaamheden langs de route, in de volgorde
 * waarin je ze tegenkomt. Op een regel klikken klapt 'm open met meer
 * detail en, als de locatie bekend is, een kaartje. Gedeeld tussen heenreis
 * en terugreis.
 */
export function VerkeerKaart({ gegevens }: { gegevens: VerkeerAntwoord | null }) {
  const [open, setOpen] = useState<number | null>(null);

  if (gegevens === null) {
    return (
      <Kaart>
        <KaartKop>Verkeersinformatie</KaartKop>
        <p className="label-mono py-4 text-center text-slate" role="status">
          Verkeersinformatie ophalen
        </p>
      </Kaart>
    );
  }

  if (gegevens.reden !== "ok" || gegevens.incidenten.length === 0) {
    return (
      <Kaart>
        <KaartKop>Verkeersinformatie</KaartKop>
        <p className="text-sm text-slate">
          {gegevens.reden === "ok"
            ? "Geen files of incidenten gemeld langs de route."
            : (REDEN_TEKST[gegevens.reden] ?? "Geen verkeersinformatie beschikbaar.")}
        </p>
      </Kaart>
    );
  }

  return (
    <Kaart className="p-0">
      <div className="px-4 pt-4 pb-1">
        <KaartKop extra={<span className="text-xs text-slate">op volgorde van de reis</span>}>
          Verkeersinformatie
        </KaartKop>
      </div>
      <ul className="divide-y divide-slate/12">
        {gegevens.incidenten.map((incident, index) => {
          const uitgeklapt = open === index;
          return (
            <li key={index}>
              <button
                type="button"
                onClick={() => setOpen(uitgeklapt ? null : index)}
                aria-expanded={uitgeklapt}
                className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-canvas"
              >
                <span
                  className={`label-mono mt-0.5 shrink-0 rounded-full px-2 py-0.5 ${
                    INCIDENT_KLEUR[incident.ernst] ?? "bg-slate/12 text-slate"
                  }`}
                >
                  {incident.categorie}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {incident.omschrijving ?? incident.categorie}
                  </span>
                  {incident.weg !== null && (
                    <span className="block truncate text-xs text-slate">{incident.weg}</span>
                  )}
                </span>
                {incident.vertragingMin !== null && incident.vertragingMin > 0 && (
                  <span className="shrink-0 font-mono text-xs text-slate">
                    +{incident.vertragingMin} min
                  </span>
                )}
                <span aria-hidden="true" className="shrink-0 text-slate">
                  {uitgeklapt ? "︿" : "﹀"}
                </span>
              </button>

              {uitgeklapt && (
                <div className="space-y-3 px-4 pb-4">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    {(incident.van !== null || incident.naar !== null) && (
                      <div className="col-span-2">
                        <dt className="label-mono text-slate">traject</dt>
                        <dd className="text-ink">
                          {incident.van ?? "—"} <span className="text-slate">→</span>{" "}
                          {incident.naar ?? "—"}
                        </dd>
                      </div>
                    )}
                    {incident.beginTijd !== null && (
                      <div>
                        <dt className="label-mono text-slate">sinds</dt>
                        <dd className="text-ink">{incidentTijd(incident.beginTijd)}</dd>
                      </div>
                    )}
                    {incident.eindTijd !== null && (
                      <div>
                        <dt className="label-mono text-slate">verwacht tot</dt>
                        <dd className="text-ink">{incidentTijd(incident.eindTijd)}</dd>
                      </div>
                    )}
                  </dl>

                  {incident.lat !== null && incident.lon !== null && (
                    <Landkaart
                      punten={[
                        {
                          naam: incident.omschrijving ?? incident.categorie,
                          rol: "onderweg",
                          lat: incident.lat,
                          lon: incident.lon,
                        },
                      ]}
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Kaart>
  );
}
