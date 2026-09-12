import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The same dedicated connection owns the lock AND executes every migration.
export async function migrateWithLock(client, apply = connection => migrate(drizzle(connection), { migrationsFolder: 'drizzle' })) {
  await client.query('SELECT pg_advisory_lock(706007)');
  try { await apply(client); }
  finally { await client.query('SELECT pg_advisory_unlock(706007)'); }
}

export async function migrateProduction(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 300000 });
  try { await client.connect(); await migrateWithLock(client); }
  finally { await client.end(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrateProduction().then(() => console.log('Migrations verified')).catch(() => {
    console.error('Database migration failed'); process.exitCode = 1;
  });
}
