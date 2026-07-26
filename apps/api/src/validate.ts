/**
 * Kleine validatiehulp. Genoeg voor deze app en zonder extra afhankelijkheid:
 * elke route pakt de velden die hij nodig heeft expliciet uit de body, met een
 * duidelijke Nederlandse foutmelding als er iets mis is.
 */

export class ValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message = "Niet gevonden") {
    super(message);
    this.name = "NotFoundError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Wrapper om een request-body, met veldnaam in elke foutmelding. */
export class Fields {
  private readonly data: Record<string, unknown>;

  constructor(body: unknown) {
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("De aanvraag moet een JSON-object bevatten");
    }
    this.data = body as Record<string, unknown>;
  }

  /** Is het veld meegestuurd? Onderscheidt "niet aanwezig" van "leeggemaakt". */
  has(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.data, name);
  }

  raw(name: string): unknown {
    return this.data[name];
  }

  text(name: string, { max = 500 }: { max?: number } = {}): string {
    const value = this.data[name];
    if (typeof value !== "string" || value.trim() === "") {
      throw new ValidationError(`${name} is verplicht`);
    }
    const trimmed = value.trim();
    if (trimmed.length > max) {
      throw new ValidationError(`${name} mag maximaal ${max} tekens lang zijn`);
    }
    return trimmed;
  }

  optionalText(name: string, { max = 500 }: { max?: number } = {}): string | null {
    const value = this.data[name];
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string") {
      throw new ValidationError(`${name} moet tekst zijn`);
    }
    const trimmed = value.trim();
    if (trimmed === "") return null;
    if (trimmed.length > max) {
      throw new ValidationError(`${name} mag maximaal ${max} tekens lang zijn`);
    }
    return trimmed;
  }

  date(name: string): string {
    const value = this.text(name, { max: 10 });
    if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
      throw new ValidationError(`${name} moet een datum zijn in de vorm jjjj-mm-dd`);
    }
    return value;
  }

  optionalDate(name: string): string | null {
    const value = this.optionalText(name, { max: 10 });
    if (value === null) return null;
    if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
      throw new ValidationError(`${name} moet een datum zijn in de vorm jjjj-mm-dd`);
    }
    return value;
  }

  optionalTime(name: string): string | null {
    const value = this.optionalText(name, { max: 5 });
    if (value === null) return null;
    if (!TIME_PATTERN.test(value)) {
      throw new ValidationError(`${name} moet een tijd zijn in de vorm uu:mm`);
    }
    return value;
  }

  optionalNumber(
    name: string,
    { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
  ): number | null {
    const value = this.data[name];
    if (value === undefined || value === null || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      throw new ValidationError(`${name} moet een getal zijn`);
    }
    if (parsed < min || parsed > max) {
      throw new ValidationError(`${name} moet tussen ${min} en ${max} liggen`);
    }
    return parsed;
  }

  /** Breedtegraad uit een adres-suggestie: -90 tot 90. */
  optionalLat(name: string): number | null {
    return this.optionalNumber(name, { min: -90, max: 90 });
  }

  /** Lengtegraad uit een adres-suggestie: -180 tot 180. */
  optionalLon(name: string): number | null {
    return this.optionalNumber(name, { min: -180, max: 180 });
  }

  boolean(name: string): boolean {
    const value = this.data[name];
    if (typeof value !== "boolean") {
      throw new ValidationError(`${name} moet waar of niet waar zijn`);
    }
    return value;
  }

  optionalUuid(name: string): string | null {
    const value = this.optionalText(name, { max: 36 });
    if (value === null) return null;
    if (!UUID_PATTERN.test(value)) {
      throw new ValidationError(`${name} is geen geldige verwijzing`);
    }
    return value;
  }

  oneOf<T extends string>(name: string, allowed: readonly T[]): T {
    const value = this.text(name, { max: 60 });
    if (!(allowed as readonly string[]).includes(value)) {
      throw new ValidationError(`${name} moet een van deze waarden zijn: ${allowed.join(", ")}`);
    }
    return value as T;
  }

  uuidList(name: string): string[] {
    const value = this.data[name];
    if (!Array.isArray(value)) {
      throw new ValidationError(`${name} moet een lijst zijn`);
    }
    return value.map((entry, index) => {
      if (typeof entry !== "string" || !UUID_PATTERN.test(entry)) {
        throw new ValidationError(`${name}[${index}] is geen geldige verwijzing`);
      }
      return entry;
    });
  }
}

/**
 * Coördinaten horen als paar bij elkaar. Eén helft zonder de andere kan alleen
 * ontstaan door een verkeerde aanroep — de autocomplete stuurt ze altijd
 * samen — en dat moet duidelijk misgaan, niet stilzwijgend een halve
 * coördinaat opslaan.
 */
export function leesCoordinaatPaar(
  fields: Fields,
  latVeld: string,
  lonVeld: string,
): { lat: number | null; lon: number | null } {
  const lat = fields.optionalLat(latVeld);
  const lon = fields.optionalLon(lonVeld);
  if ((lat === null) !== (lon === null)) {
    throw new ValidationError(`${latVeld} en ${lonVeld} horen samen opgegeven te worden`);
  }
  return { lat, lon };
}

/** Valideert een id uit het pad. */
export function pathUuid(value: string | undefined, name = "id"): string {
  if (!value || !UUID_PATTERN.test(value)) {
    throw new ValidationError(`${name} in het pad is geen geldige verwijzing`);
  }
  return value;
}
