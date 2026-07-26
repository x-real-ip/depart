import type { ReactNode } from "react";

/**
 * De bouwstenen die alle schermen delen. Elk interactief element is een echte
 * button of link, zodat toetsenbordnavigatie en schermlezers werken zonder
 * extra hulp.
 */

export function Kaart({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`kaart p-4 ${className}`}>{children}</section>;
}

export function KaartKop({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="label-mono text-slate">{children}</h2>
      {extra}
    </div>
  );
}

type KnopSoort = "primair" | "secundair" | "stil" | "waarschuwing";

const KNOP_STIJL: Record<KnopSoort, string> = {
  primair: "bg-navy text-white hover:bg-navy-deep",
  secundair: "bg-white text-ink border border-slate/25 hover:border-slate/50",
  stil: "text-slate hover:text-ink hover:bg-canvas",
  waarschuwing: "bg-white text-alert border border-alert/35 hover:bg-alert/5",
};

export function Knop({
  children,
  onClick,
  soort = "secundair",
  type = "button",
  disabled = false,
  breed = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  soort?: KnopSoort;
  type?: "button" | "submit";
  disabled?: boolean;
  breed?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-45 ${
        KNOP_STIJL[soort]
      } ${breed ? "w-full" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

/** Voortgangsbalk met percentage. De balk zelf is niet interactief. */
export function VoortgangsBalk({
  percentage,
  label,
}: {
  percentage: number;
  label?: string;
}) {
  return (
    <div>
      {label !== undefined && (
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="label-mono text-slate">{label}</span>
          <span className="font-mono text-sm font-semibold text-ink">{percentage}%</span>
        </div>
      )}
      <div
        className="h-2 overflow-hidden rounded-full bg-slate/15"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Voortgang"}
      >
        <div
          className="h-full rounded-full bg-amber transition-[width] duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

/** Een lege staat is een uitnodiging, geen mededeling. */
export function LegeStaat({
  titel,
  uitnodiging,
  actie,
}: {
  titel: string;
  uitnodiging: string;
  actie?: ReactNode;
}) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="font-display text-lg font-extrabold text-ink">{titel}</p>
      <p className="mx-auto mt-1.5 max-w-[26ch] text-sm text-slate">{uitnodiging}</p>
      {actie !== undefined && <div className="mt-4 flex justify-center">{actie}</div>}
    </div>
  );
}

export function Veld({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="label-mono mb-1.5 block text-slate">{label}</span>
      {children}
      {hint !== undefined && <span className="mt-1 block text-xs text-slate">{hint}</span>}
    </label>
  );
}

export const INVOER_STIJL =
  "w-full rounded-xl border border-slate/25 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-slate/60 focus:border-navy";

/** Meldingsbalk voor fouten uit de api. */
export function Melding({ tekst, onSluit }: { tekst: string; onSluit?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-xl border border-alert/30 bg-alert/8 px-3.5 py-2.5"
    >
      <p className="text-sm text-alert">{tekst}</p>
      {onSluit !== undefined && (
        <button
          type="button"
          onClick={onSluit}
          aria-label="Melding sluiten"
          className="shrink-0 text-alert/70 hover:text-alert"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/** Bevestiging voor iets wat je niet ongedaan kunt maken. */
export function Bevestiging({
  vraag,
  toelichting,
  bevestigLabel,
  onBevestig,
  onAnnuleer,
}: {
  vraag: string;
  toelichting?: string;
  bevestigLabel: string;
  onBevestig: () => void;
  onAnnuleer: () => void;
}) {
  return (
    <div className="rounded-xl border border-alert/30 bg-alert/8 p-3.5">
      <p className="text-sm font-semibold text-ink">{vraag}</p>
      {toelichting !== undefined && <p className="mt-1 text-xs text-slate">{toelichting}</p>}
      <div className="mt-3 flex gap-2">
        <Knop soort="waarschuwing" onClick={onBevestig}>
          {bevestigLabel}
        </Knop>
        <Knop soort="stil" onClick={onAnnuleer}>
          Laat maar
        </Knop>
      </div>
    </div>
  );
}

export function Laden({ tekst = "Even laden" }: { tekst?: string }) {
  return (
    <p className="label-mono py-10 text-center text-slate" role="status">
      {tekst}
    </p>
  );
}
