/**
 * Standaardlijsten die de app kan voorstellen bij een nieuwe reis. Bewust hier
 * en niet in de database: het zijn suggesties, geen gegevens.
 */

/** Kampeer-basislijst voor de gezamenlijke uitrusting. */
export const STANDAARD_UITRUSTING = [
  "Tent",
  "Haringen en hamer",
  "Luifel",
  "Gasfles",
  "Gasslang",
  "Stroomkabel 25 m",
  "Adapter",
  "Koelbox",
  "Campingtafel",
  "Stoelen",
  "Grondzeil",
  "Zaklampen",
  "EHBO-kit",
] as const;

/** Basislijst voor persoonlijke spullen, zodat een nieuwe lijst niet leeg begint. */
export const STANDAARD_PERSOONLIJK = [
  "Kleding",
  "Regenjas",
  "Zwemkleding",
  "Toilettas",
  "Schoenen",
  "Slaapzak",
  "Kussen",
] as const;

/**
 * Documenttypes die bij vrijwel elke kampeervakantie met de auto horen.
 * `perPersoon` betekent: één per reiziger. De rest hoort bij het gezin of bij
 * de auto (travelerId blijft dan leeg).
 */
export const STANDAARD_DOCUMENTTYPES = [
  { type: "Paspoort of ID", perPersoon: true },
  { type: "Camping card", perPersoon: false },
  { type: "Campingreservering", perPersoon: false },
  { type: "Groene kaart", perPersoon: false },
  { type: "Kentekenbewijs", perPersoon: false },
  { type: "Reisverzekering", perPersoon: false },
  { type: "Milieuvignet", perPersoon: false },
] as const;

/** Losse types voor de keuzelijst in het formulier. */
export const DOCUMENTTYPES = STANDAARD_DOCUMENTTYPES.map((entry) => entry.type);
