/** Opmaak van datums, afstanden en tijden. Alles in het Nederlands. */

const DATUM_LANG = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const DATUM_KORT = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });

export function datumLang(isoDatum: string): string {
  return DATUM_LANG.format(new Date(`${isoDatum}T12:00:00`));
}

export function datumKort(isoDatum: string): string {
  return DATUM_KORT.format(new Date(`${isoDatum}T12:00:00`));
}

/** Aantal dagen tot de vertrekdatum. Negatief betekent: al vertrokken. */
export function dagenTot(isoDatum: string): number {
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  const doel = new Date(`${isoDatum}T00:00:00`);
  return Math.round((doel.getTime() - vandaag.getTime()) / 86_400_000);
}

export function rijtijd(minuten: number | null): string {
  if (minuten === null) return "—";
  const uren = Math.floor(minuten / 60);
  const rest = minuten % 60;
  if (uren === 0) return `${rest} min`;
  return rest === 0 ? `${uren} uur` : `${uren} u ${rest} min`;
}

export function afstand(km: number | null): string {
  return km === null ? "—" : `${km.toLocaleString("nl-NL")} km`;
}

export function bedrag(euro: number | null): string {
  if (euro === null) return "—";
  return euro.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
}

export function bestandsgrootte(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Wat er in de auto verplicht is, per land. Bewust een korte, vaste lijst:
 * het gaat om de landen waar je vanuit Nederland met de auto naar een camping
 * rijdt. Onbekende landen leveren de Europese basis op.
 */
const VERPLICHT_PER_LAND: Record<string, string[]> = {
  Nederland: ["Gevarendriehoek (aanbevolen)", "EHBO-kit (aanbevolen)"],
  België: ["Gevarendriehoek", "Veiligheidshesje", "EHBO-kit", "Brandblusser"],
  Duitsland: ["Gevarendriehoek", "Veiligheidshesje", "EHBO-kit", "Milieuvignet (Umweltplakette)"],
  Frankrijk: ["Gevarendriehoek", "Veiligheidshesje", "Milieuvignet (Crit'Air)"],
  Luxemburg: ["Gevarendriehoek", "Veiligheidshesje"],
  Zwitserland: ["Gevarendriehoek", "Vignet voor de snelweg"],
  Oostenrijk: ["Gevarendriehoek", "Veiligheidshesje", "EHBO-kit", "Vignet voor de snelweg"],
  Italië: ["Gevarendriehoek", "Veiligheidshesje"],
  Spanje: ["Gevarendriehoek", "Veiligheidshesje"],
  Denemarken: ["Gevarendriehoek"],
  Tsjechië: ["Gevarendriehoek", "Veiligheidshesje", "EHBO-kit", "Vignet voor de snelweg"],
  Slovenië: ["Gevarendriehoek", "Veiligheidshesje", "Vignet voor de snelweg"],
  Kroatië: ["Gevarendriehoek", "Veiligheidshesje", "EHBO-kit"],
};

export function verplichtInDeAuto(land: string): string[] {
  return (
    VERPLICHT_PER_LAND[land] ?? [
      "Gevarendriehoek",
      "Veiligheidshesje",
      "EHBO-kit",
    ]
  );
}

/** Landen waarvoor we een specifieke lijst hebben, voor de keuzelijst. */
export const BEKENDE_LANDEN = Object.keys(VERPLICHT_PER_LAND).sort((a, b) =>
  a.localeCompare(b, "nl"),
);
