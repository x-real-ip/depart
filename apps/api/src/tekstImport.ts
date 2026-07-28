/** Meer dan dit importeer je niet per ongeluk in één keer plakken. */
const MAX_IMPORT_REGELS = 200;

/**
 * Zet geplakte tekst om in een lijst labels: één per regel, opsommingstekens
 * en nummering eraf (uit Notities, Reminders, Keep, Markdown-todo's, wat dan
 * ook), lege regels en interne dubbelingen eruit. Gebruikt door zowel de
 * inpaklijsten als de takenlijsten — het plakgedrag hoort overal hetzelfde
 * te zijn.
 */
export function parseGeplakteRegels(tekst: string): string[] {
  const gezien = new Set<string>();
  const resultaat: string[] = [];
  for (const ruw of tekst.split(/\r?\n/)) {
    const label = ruw
      .replace(/^\s*[-*•☐□✓✔]+\s*/, "")
      .replace(/^\[[ xX]?\]\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .trim();
    if (label === "" || label.length > 120) continue;
    const sleutel = label.toLowerCase();
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    resultaat.push(label);
    if (resultaat.length >= MAX_IMPORT_REGELS) break;
  }
  return resultaat;
}
