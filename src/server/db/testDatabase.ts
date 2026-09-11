import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export function assertTestDatabaseUrl(databaseUrl: string): void {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("resetTestDatabase only accepts a PostgreSQL kordev_test URL");
  }

  const isPostgreSql = parsedUrl.protocol === "postgres:" || parsedUrl.protocol === "postgresql:";
  if (!isPostgreSql || parsedUrl.pathname !== "/kordev_test") {
    throw new Error("resetTestDatabase only accepts a PostgreSQL kordev_test URL");
  }
}

export async function resetTestDatabase(databaseUrl: string): Promise<void> {
  assertTestDatabaseUrl(databaseUrl);
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("CREATE SCHEMA public");
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }
}
