import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('published Markdown links use canonical trailing-slash internal URLs', () => {
  const violations = [];
  for (const name of readdirSync('public/blog').filter(name => name.endsWith('.md'))) {
    const source = readFileSync(path.join('public/blog', name), 'utf8');
    for (const match of source.matchAll(/\]\((\/(?:blog|cases|services)\/[^)\s]+)\)/g)) {
      const pathname = match[1].split(/[?#]/, 1)[0];
      if (!pathname.endsWith('/') && !/\.[a-z0-9]+$/i.test(pathname)) violations.push(`${name}: ${match[1]}`);
    }
  }
  assert.deepEqual(violations, []);
});
