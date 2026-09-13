import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { Client } from 'pg';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { safePath } from './release-files.mjs';

export function checkReport(report, batch, checksum) {
  if(!report.ok || report.counts?.articles!==46 || report.counts?.cases!==9 || report.collisions?.length!==0 || report.invalidRecords?.length!==0 || (report.mismatches && report.mismatches.length)) throw Error('Expected verified Russian counts 46/9 with zero errors');
  if(report.batchId!==batch || !/^[a-f0-9]{64}$/.test(report.checksums?.batch ?? '') || (checksum && report.checksums.batch!==checksum)) throw Error('Approved batch/checksum mismatch');
}
export async function checkDatabase(mode, databaseUrl=process.env.DATABASE_URL) {
  if(!databaseUrl) throw Error('DATABASE_URL is required');
  const client=new Client({connectionString:databaseUrl,connectionTimeoutMillis:5000});
  try {
    await client.connect();
    if(mode==='pristine') {
      const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows;
      for(const {tablename} of tables) {
        const quoted='"'+tablename.replaceAll('"','""')+'"';
        if(Number((await client.query(`SELECT count(*) AS count FROM public.${quoted}`)).rows[0].count)!==0) throw Error('First-install database is not empty');
      }
    } else if(mode==='empty') {
      for(const table of ['content_entries','content_relations','content_revisions','media_assets','redirects','site_settings','admin_users']) {
        if(Number((await client.query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count)!==0) throw Error('First-install database is not empty');
      }
    } else if(mode==='populated') {
      const rows=(await client.query('SELECT kind,status,count(*)::int AS count FROM content_entries GROUP BY kind,status ORDER BY kind::text,status::text')).rows;
      if(JSON.stringify(rows)!==JSON.stringify([{kind:'article',status:'published',count:46},{kind:'case',status:'published',count:9}])) throw Error('Target database must contain exactly 46 published articles and 9 published cases');
    } else throw Error('Invalid database check');
  } finally {await client.end();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [mode,...args]=process.argv.slice(2);
    if(mode==='report') checkReport(JSON.parse(readFileSync(args[0],'utf8')),args[1],args[2]);
    else if(mode==='paths') {
      const [state,route,reports,repo]=args;
      for(const target of args) safePath(target);
      if([homedir(),'/tmp','/private/tmp','/var','/var/lib','/private/var'].includes(reports) || repo.startsWith(reports+path.sep)) throw Error('Dedicated report directory required');
      if(existsSync(route)) throw Error('Route already exists');
      if(existsSync(state) && readdirSync(state).length) throw Error('Release state is not empty');
      if(reports===repo || reports.startsWith(repo+path.sep)) throw Error('Reports must be outside checkout');
      if(existsSync(reports) && readdirSync(reports).some(name=>!['dry-run.json','apply-dry-run.json','import.json','verify.json'].includes(name))) throw Error('Report directory contains unrelated files');
    } else if(mode==='url') {
      const url=new URL(process.env.DATABASE_URL);
      if(!['postgres:','postgresql:'].includes(url.protocol) || url.hostname!=='postgres' || !['','5432'].includes(url.port) || !url.username || !url.password || url.pathname!==`/${process.env.POSTGRES_DB}` || decodeURIComponent(url.username)!==process.env.POSTGRES_USER || decodeURIComponent(url.password)!==process.env.POSTGRES_PASSWORD || url.search || url.hash) throw Error('Database must match internal Compose PostgreSQL and explicit credentials');
    } else await checkDatabase(mode);
  } catch(error) {console.error(['report','paths'].includes(process.argv[2])?error.message:'Bootstrap database/configuration check failed');process.exitCode=1;}
}
