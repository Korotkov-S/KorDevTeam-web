import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url);

// Binary data transformation; no runtime bootstrap or filesystem synchronization is invoked.
export async function sanitizeLegacyContent(bytes) {
  const SQL=await require('sql.js')();
  const db=new SQL.Database(new Uint8Array(bytes));
  try {
    const tables=db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0].values.map(row=>row[0]);
    const quote=value=>'"'+value.replaceAll('"','""')+'"';
    db.run('PRAGMA secure_delete=ON');
    for(const table of tables) {
      const columns=db.exec(`PRAGMA table_info(${quote(table)})`)[0].values.map(row=>row[1]);
      if(columns.includes('lang')) db.run(`DELETE FROM ${quote(table)} WHERE lang IS NULL OR lang != 'ru'`);
      else if(!['_meta','sqlite_sequence'].includes(table)) throw Error(`Unreviewed auxiliary table: ${table}`);
    }
    db.run('VACUUM');
    return db.export();
  } finally {db.close();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  if(process.argv.length!==4) throw Error('Usage: sanitize-legacy-content.mjs input.sqlite new-output.sqlite');
  writeFileSync(process.argv[3],await sanitizeLegacyContent(readFileSync(process.argv[2])),{flag:'wx',mode:0o600});
}
