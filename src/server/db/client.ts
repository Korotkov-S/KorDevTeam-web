import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export function createDb(databaseUrl: string): NodePgDatabase<typeof schema> {
  const pool = new Pool({ connectionString: databaseUrl, allowExitOnIdle: true });
  pool.on("error", () => {
    console.error("PostgreSQL pool connection error");
  });
  return drizzle(pool, { schema });
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
