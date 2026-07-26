import { useEffect, useRef, useState } from "react";

/**
 * Eén split-flap tegel. Klapt om zodra het teken verandert; bij
 * prefers-reduced-motion wisselt het teken zonder beweging (de animatie staat
 * dan uit via de CSS).
 */
function Tegel({ teken }: { teken: string }) {
  const [animeer, setAnimeer] = useState(false);
  const vorigTeken = useRef(teken);

  useEffect(() => {
    if (vorigTeken.current === teken) return;
    vorigTeken.current = teken;
    setAnimeer(true);
    const timer = window.setTimeout(() => setAnimeer(false), 440);
    return () => window.clearTimeout(timer);
  }, [teken]);

  return (
    <span
      className={`relative flex h-16 w-12 items-center justify-center rounded-lg bg-navy-deep font-mono text-3xl font-semibold text-canvas shadow-inner ${
        animeer ? "flap-animatie" : ""
      }`}
    >
      {/* De naad in het midden, zoals op een echt vertrekbord. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 h-px bg-canvas/20"
      />
      {teken}
    </span>
  );
}

/**
 * De aftelklok: aantal dagen tot vertrek in twee losse tegels.
 *
 * Boven de 99 dagen zou een tweecijferige klok niet kloppen; dan staat er "99+"
 * op één tegel in plaats van een verkeerd getal.
 */
export function SplitFlapAftelklok({ dagen }: { dagen: number }) {
  const { tekens, uitleg } = aftellen(dagen);

  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1.5" role="img" aria-label={uitleg}>
        {tekens.map((teken, index) => (
          <Tegel key={index} teken={teken} />
        ))}
      </div>
      <span className="label-mono max-w-[7ch] leading-tight text-canvas/70">{eenheid(dagen)}</span>
    </div>
  );
}

function aftellen(dagen: number): { tekens: string[]; uitleg: string } {
  if (dagen < 0) {
    return { tekens: ["G", "O"], uitleg: "Je bent onderweg" };
  }
  if (dagen === 0) {
    return { tekens: ["N", "U"], uitleg: "Vandaag is de vertrekdag" };
  }
  if (dagen > 99) {
    return { tekens: ["9", "9", "+"], uitleg: "Meer dan 99 dagen tot vertrek" };
  }
  const tekst = String(dagen).padStart(2, "0");
  return {
    tekens: [...tekst],
    uitleg: `${dagen} ${dagen === 1 ? "dag" : "dagen"} tot vertrek`,
  };
}

function eenheid(dagen: number): string {
  if (dagen < 0) return "onderweg";
  if (dagen === 0) return "vertrek";
  return dagen === 1 ? "dag" : "dagen";
}
