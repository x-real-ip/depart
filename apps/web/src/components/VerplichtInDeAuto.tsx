import { Kaart, KaartKop } from "./ui.tsx";
import { verplichtInDeAuto } from "../lib/format.ts";

/**
 * Wat wettelijk verplicht (of aanbevolen) is in de auto, per land dat de
 * reis doorkruist. Gebruikt op zowel de heenreis als de terugreis — de
 * regels gelden voor het rijden zelf, niet voor de richting.
 */
export function VerplichtInDeAuto({ landen }: { landen: string[] }) {
  if (landen.length === 0) return null;

  return (
    <Kaart className="space-y-3">
      <KaartKop>Verplicht in de auto</KaartKop>
      {landen.map((land) => (
        <div key={land}>
          {landen.length > 1 && <p className="label-mono mb-1.5 text-slate">{land}</p>}
          <ul className="space-y-1.5">
            {verplichtInDeAuto(land).map((ding) => (
              <li key={ding} className="flex items-start gap-2 text-sm text-ink">
                <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-forest" />
                {ding}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Kaart>
  );
}
