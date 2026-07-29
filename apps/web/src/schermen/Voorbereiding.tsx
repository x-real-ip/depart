import { useState } from "react";
import type { Traveler } from "../lib/api.ts";
import { Documenten } from "./Documenten.tsx";
import { Inpaklijst } from "./Inpaklijst.tsx";
import { Taken } from "./Taken.tsx";

export type VoorbereidingSubtab = "documenten" | "inpaklijst" | "taken";

const SUBTABS: { id: VoorbereidingSubtab; label: string }[] = [
  { id: "documenten", label: "Documenten" },
  { id: "inpaklijst", label: "Inpaklijst" },
  { id: "taken", label: "Taken" },
];

/**
 * Alles wat er vóór vertrek geregeld moet worden, gebundeld onder één tab:
 * documenten, inpakken en losse taken. Een eigen rij subtabs erin, zodat het
 * hoofdmenu niet met losse tabs vervuild raakt.
 */
export function Voorbereiding({
  tripId,
  reizigers,
  initieleSubtab,
}: {
  tripId: string;
  reizigers: Traveler[];
  /** Waar dit scherm op opent — bijvoorbeeld via een knop op het overzicht. */
  initieleSubtab?: VoorbereidingSubtab;
}) {
  const [subtab, setSubtab] = useState<VoorbereidingSubtab>(initieleSubtab ?? "documenten");

  return (
    <div className="space-y-4">
      <nav aria-label="Onderdelen van de voorbereiding">
        <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {SUBTABS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="tab"
                aria-selected={subtab === item.id}
                onClick={() => setSubtab(item.id)}
                className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
                  subtab === item.id ? "bg-amber text-navy" : "bg-white text-slate hover:text-ink"
                }`}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {subtab === "documenten" && <Documenten tripId={tripId} reizigers={reizigers} />}
      {subtab === "inpaklijst" && <Inpaklijst tripId={tripId} reizigers={reizigers} />}
      {subtab === "taken" && <Taken tripId={tripId} reizigers={reizigers} />}
    </div>
  );
}
