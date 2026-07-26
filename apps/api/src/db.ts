import pg from "pg";
import { config } from "./config.js";

const { Pool, types } = pg;

// date-kolommen komen als 'YYYY-MM-DD' terug in plaats van als Date-object.
// Anders schuift een datum een dag op zodra de server in een andere tijdzone
// staat dan de browser, en vertrekdatum is nu juist een kalenderdag.
const DATE_OID = 1082;
types.setTypeParser(DATE_OID, (value) => value);

// numeric komt standaard als string terug (om precisie te bewaren). tolKosten
// is een geldbedrag met twee decimalen en past ruim in een JS-number.
const NUMERIC_OID = 1700;
types.setTypeParser(NUMERIC_OID, (value) => (value === null ? null : Number(value)));

// bigint (grootte in bytes) idem.
const INT8_OID = 20;
types.setTypeParser(INT8_OID, (value) => (value === null ? null : Number(value)));

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(sql, params);
}

/** Eén rij of null. */
export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const result = await pool.query<T>(sql, params);
  return result.rows[0] ?? null;
}

/** Voert de callback uit binnen één transactie. */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Wacht tot de database bereikbaar is. Handig bij opstarten: de pod van de api
 * kan eerder klaar zijn dan postgres.
 */
export async function waitForDatabase(attempts = 30, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
