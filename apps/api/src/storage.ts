import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { ALLOWED_MIMETYPES, config } from "./config.js";
import { ValidationError } from "./validate.js";

/**
 * Bestanden staan op het gemounte documentenvolume, niet in de database. In de
 * database staat alleen het relatieve pad, zodat het volume verplaatst kan
 * worden zonder de gegevens aan te passen.
 *
 * Er wordt nooit een bestandsnaam of documentinhoud gelogd.
 */

export const EXTENSIE_PER_MIMETYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
};

export interface OpgeslagenBestand {
  bestandspad: string;
  mimetype: string;
  grootte: number;
}

/**
 * Controleert het type op de inhoud van het bestand, niet op de extensie of de
 * meegestuurde content-type. Een .pdf die eigenlijk een uitvoerbaar bestand is
 * komt hier niet door.
 */
export async function bepaalMimetype(buffer: Buffer): Promise<string> {
  const gedetecteerd = await fileTypeFromBuffer(buffer);
  if (!gedetecteerd) {
    throw new ValidationError(
      "Het type van dit bestand is niet te bepalen. Toegestaan zijn pdf, jpeg, png en heic.",
    );
  }
  if (!(ALLOWED_MIMETYPES as readonly string[]).includes(gedetecteerd.mime)) {
    throw new ValidationError(
      `Bestanden van het type ${gedetecteerd.mime} zijn niet toegestaan. Kies een pdf, jpeg, png of heic.`,
    );
  }
  return gedetecteerd.mime;
}

/** Zorgt dat de basismap bestaat. Wordt bij het opstarten aangeroepen. */
export async function initDocumentsPath(): Promise<void> {
  await mkdir(config.documentsPath, { recursive: true });
}

/**
 * Zet een relatief pad om naar een absoluut pad binnen het documentenvolume.
 * Een pad dat buiten het volume uitkomt wordt geweigerd — de paden komen uit
 * de database, maar een controle hier kost niets.
 */
export function absoluutPad(relatiefPad: string): string {
  const basis = path.resolve(config.documentsPath);
  const volledig = path.resolve(basis, relatiefPad);
  if (volledig !== basis && !volledig.startsWith(basis + path.sep)) {
    throw new Error("Documentpad valt buiten het documentenvolume");
  }
  return volledig;
}

/**
 * Schrijft het bestand weg als <tripId>/<documentId>.<ext>. De naam op schijf
 * is dus altijd voorspelbaar en bevat geen door de gebruiker aangeleverde
 * tekst; de oorspronkelijke bestandsnaam staat in de database.
 */
export async function bewaarBestand(
  tripId: string,
  documentId: string,
  buffer: Buffer,
  mimetype: string,
): Promise<OpgeslagenBestand> {
  const extensie = EXTENSIE_PER_MIMETYPE[mimetype] ?? "bin";
  const relatiefPad = path.join(tripId, `${documentId}.${extensie}`);
  const doelPad = absoluutPad(relatiefPad);

  await mkdir(path.dirname(doelPad), { recursive: true });
  // mode 0600: alleen de gebruiker waaronder de api draait mag erbij.
  await writeFile(doelPad, buffer, { mode: 0o600 });

  return { bestandspad: relatiefPad, mimetype, grootte: buffer.byteLength };
}

/** Verwijdert het bestand van schijf. Al weg is ook goed. */
export async function verwijderBestand(relatiefPad: string): Promise<void> {
  await rm(absoluutPad(relatiefPad), { force: true });
}

/** Verwijdert de hele map van een reis, inclusief alles erin. */
export async function verwijderReisMap(tripId: string): Promise<void> {
  await rm(absoluutPad(tripId), { recursive: true, force: true });
}

/** Leesstroom voor het uitleveren van een document via de api. */
export function leesBestand(relatiefPad: string) {
  return createReadStream(absoluutPad(relatiefPad));
}
