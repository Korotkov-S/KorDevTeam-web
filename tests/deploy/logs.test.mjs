import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';

function setup(t) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'kordev-logs-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(`${dir}/logs`); mkdirSync(`${dir}/bin`);
  writeFileSync(`${dir}/bin/docker`, '#!/bin/bash\nset -eu\nif [[ "$1" == ps ]]; then printf "kordevteam-blue\\nkordevteam-green\\nunrelated\\n"; else printf "%s\\n" "$*" >> "$COMMANDS"; printf "web stdout\\n"; printf "web stderr\\n" >&2; fi\n', { mode: 0o755 });
  return { dir, run: target => spawnSync('bash', ['scripts/archive-web-logs.sh', target], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, COMMANDS: `${dir}/commands` } }) };
}
test('web log archive captures only both named containers, compresses privately, retains 30 days and ignores unrelated files', t => {
  const f = setup(t);
  const old = 'kordevteam-blue-2000-01-01T00-00-00-000Z.log.gz';
  writeFileSync(`${f.dir}/logs/${old}`, 'old');
  writeFileSync(`${f.dir}/logs/unrelated.log.gz`, 'keep');
  const result = f.run(`${f.dir}/logs`); assert.equal(result.status, 0, result.stderr);
  const archives = readdirSync(`${f.dir}/logs`).filter(f => f.startsWith('kordevteam-'));
  assert.equal(archives.length, 2); assert.equal(existsSync(`${f.dir}/logs/${old}`), false);
  assert.equal(readFileSync(`${f.dir}/logs/unrelated.log.gz`, 'utf8'), 'keep');
  for (const name of archives) {
    assert.equal(statSync(`${f.dir}/logs/${name}`).mode & 0o777, 0o600);
    const text = gunzipSync(readFileSync(`${f.dir}/logs/${name}`)).toString();
    assert.match(text, /web stdout/); assert.match(text, /web stderr/);
  }
  const commands = readFileSync(`${f.dir}/commands`, 'utf8');
  assert.match(commands, /--since .* --until .* --timestamps kordevteam-blue/);
  assert.doesNotMatch(commands, /unrelated/);
});
test('web log archive rejects broad directories and symlink targets before docker', t => {
  const f = setup(t); symlinkSync(`${f.dir}/logs`, `${f.dir}/link`);
  for (const target of ['/', process.cwd(), process.env.HOME, '.', `${f.dir}/link`]) assert.notEqual(f.run(target).status, 0);
  assert.equal(existsSync(`${f.dir}/commands`), false);
});
