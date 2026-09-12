import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

import * as schema from "./schema";

export function createDb(databaseUrl: string): NodePgDatabase<typeof schema> {
  const pool = new Pool({ connectionString: databaseUrl, allowExitOnIdle: true,
    connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  pool.on("error", () => {
    console.error("PostgreSQL pool connection error");
  });
  return drizzle(pool, { schema });
}

export async function checkDatabaseReady(): Promise<void> {
  await getDb().execute(sql`SELECT 1`);
}

let database: NodePgDatabase<typeof schema> | undefined;

export function getDb(): NodePgDatabase<typeof schema> {
  if (!database) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be set before accessing PostgreSQL");
    }
    database = createDb(databaseUrl);
  }
  return database;
}
