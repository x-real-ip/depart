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

/**
 * WMO-weercodes (zoals Open-Meteo ze teruggeeft) naar een icoon en een korte
 * omschrijving. Groepen van codes die er in de praktijk hetzelfde uitzien
 * (bijvoorbeeld lichte/matige/zware regen) delen één icoon.
 */
const WEERCODE_ICONEN: { codes: number[]; icoon: string; omschrijving: string }[] = [
  { codes: [0], icoon: "☀️", omschrijving: "Onbewolkt" },
  { codes: [1], icoon: "🌤️", omschrijving: "Overwegend onbewolkt" },
  { codes: [2], icoon: "⛅", omschrijving: "Half bewolkt" },
  { codes: [3], icoon: "☁️", omschrijving: "Bewolkt" },
  { codes: [45, 48], icoon: "🌫️", omschrijving: "Mist" },
  { codes: [51, 53, 55, 56, 57], icoon: "🌦️", omschrijving: "Motregen" },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], icoon: "🌧️", omschrijving: "Regen" },
  { codes: [71, 73, 75, 77, 85, 86], icoon: "🌨️", omschrijving: "Sneeuw" },
  { codes: [95, 96, 99], icoon: "⛈️", omschrijving: "Onweer" },
];

const WEERCODE_NAAR_ICOON = new Map(
  WEERCODE_ICONEN.flatMap(({ codes, icoon, omschrijving }) =>
    codes.map((code) => [code, { icoon, omschrijving }] as const),
  ),
);

export function weerIcoon(code: number | null): { icoon: string; omschrijving: string } {
  return code === null
    ? { icoon: "❔", omschrijving: "Onbekend" }
    : (WEERCODE_NAAR_ICOON.get(code) ?? { icoon: "❔", omschrijving: "Onbekend" });
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

/** Eén officieel noodnummer, zoals de politie of ambulance van een land. */
export interface OfficieelNoodnummer {
  label: string;
  nummer: string;
}

/**
 * Officiële noodnummers per land. 112 werkt in de hele EU en ook in
 * Zwitserland, maar de nationale nummers voor politie, brandweer en
 * ambulance lopen uiteen — die staan er apart bij waar bekend.
 */
const NOODNUMMERS_PER_LAND: Record<string, OfficieelNoodnummer[]> = {
  Nederland: [
    { label: "Algemeen alarmnummer", nummer: "112" },
    { label: "Politie (geen spoed)", nummer: "0900-8844" },
  ],
  België: [
    { label: "Algemeen alarmnummer", nummer: "112" },
    { label: "Politie", nummer: "101" },
  ],
  Duitsland: [
    { label: "Algemeen alarmnummer", nummer: "112" },
    { label: "Politie", nummer: "110" },
  ],
  Frankrijk: [
    { label: "Algemeen alarmnummer", nummer: "112" },
    { label: "Politie", nummer: "17" },
    { label: "Brandweer", nummer: "18" },
    { label: "Ambulance (SAMU)", nummer: "15" },
  ],
  Luxemburg: [
    { label: "Algemeen alarmnummer", nummer: "112" },
    { label: "Politie", nummer: "113" },
  ],
  Zwitserland: [
    { label: "Algemeen alarmnummer", nummer: "112" },
    { label: "Politie", nummer: "117" },
    { label: "Brandweer", nummer: "118" },
    { label: "Ambulance", nummer: "144" },
  ],
  Oostenrijk: [
    { label: "Algemeen alarmnummer", nummer: "112" },
    { label: "Politie", nummer: "133" },
    { label: "Brandweer", nummer: "122" },
    { label: "Ambulance", nummer: "144" },
  ],
  Italië: [
    { label: "Algemeen alarmnummer", nummer: "112" },
    { label: "Brandweer", nummer: "115" },
    { label: "Ambulance", nummer: "118" },
  ],
  Spanje: [
    { label: "Algemeen alarmnummer", nummer: "112" },
    { label: "Politie Nacional", nummer: "091" },
    { label: "Guardia Civil", nummer: "062" },
  ],
  Denemarken: [{ label: "Algemeen alarmnummer", nummer: "112" }],
  Tsjechië: [
    { label: "Algemeen alarmnummer", nummer: "112" },
    { label: "Politie", nummer: "158" },
    { label: "Brandweer", nummer: "150" },
    { label: "Ambulance", nummer: "155" },
  ],
  Slovenië: [
    { label: "Algemeen alarmnummer", nummer: "112" },
    { label: "Politie", nummer: "113" },
  ],
  Kroatië: [
    { label: "Algemeen alarmnummer", nummer: "112" },
    { label: "Politie", nummer: "192" },
    { label: "Brandweer", nummer: "193" },
    { label: "Ambulance", nummer: "194" },
  ],
};

/** Onbekende landen krijgen alleen het Europese algemene alarmnummer. */
const NOODNUMMERS_STANDAARD: OfficieelNoodnummer[] = [
  { label: "Algemeen alarmnummer (EU)", nummer: "112" },
];

export function officieleNoodnummers(land: string): OfficieelNoodnummer[] {
  return NOODNUMMERS_PER_LAND[land] ?? NOODNUMMERS_STANDAARD;
}
