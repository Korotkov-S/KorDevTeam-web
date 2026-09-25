import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildContentReleaseManifest,
  contentReleaseItemChecksum,
  contentReleaseManifestJson,
} from "./manifest";

test("current sources produce a stable complete manifest", async () => {
  const first = await buildContentReleaseManifest();
  const second = await buildContentReleaseManifest();

  assert.equal(first.schemaVersion, 1);
  assert.equal(first.checksum, second.checksum);
  assert.deepEqual(first.counts, { article: 46, case: 23, service: 7, faq: 69 });
  assert.deepEqual(first.items.map(item => item.key), [...first.items.map(item => item.key)].sort());
  assert.equal(new Set(first.items.map(item => item.key)).size, first.items.length);
});

test("service relation order changes the managed database checksum", async () => {
  const manifest = await buildContentReleaseManifest();
  const service = manifest.items.find(item => item.kind === "service")!;
  const reversed = { ...service, relations: [...service.relations].reverse() };

  assert.notEqual(contentReleaseItemChecksum(service), contentReleaseItemChecksum(reversed));
});

async function sourceFiles(root: string): Promise<Array<{ relative: string; body: Buffer }>> {
  const files = [
    "public/content/blog.ru.json",
    "content/services.ru.json",
    ...(await readdir(path.join(root, "public/blog")))
      .filter(name => name.endsWith(".md"))
      .map(name => `public/blog/${name}`),
    ...(await readdir(path.join(root, "content/portfolio/cases")))
      .filter(name => name.endsWith(".json"))
      .map(name => `content/portfolio/cases/${name}`),
  ].sort();
  return Promise.all(files.map(async relative => ({
    relative,
    body: await readFile(path.join(root, relative)),
  })));
}

async function writeSourceRoot(files: Array<{ relative: string; body: Buffer }>, reverse: boolean): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "kordev-content-release-"));
  const ordered = reverse ? [...files].reverse() : files;
  for (const file of ordered) {
    const destination = path.join(root, file.relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.body);
  }
  return root;
}

test("manifest JSON is independent of source file creation order", async t => {
  const files = await sourceFiles(process.cwd());
  const firstRoot = await writeSourceRoot(files, false);
  const secondRoot = await writeSourceRoot(files, true);
  t.after(async () => {
    await Promise.all([
      rm(firstRoot, { recursive: true, force: true }),
      rm(secondRoot, { recursive: true, force: true }),
    ]);
  });

  const first = await buildContentReleaseManifest(firstRoot);
  const second = await buildContentReleaseManifest(secondRoot);

  assert.equal(first.checksum, second.checksum);
  assert.equal(contentReleaseManifestJson(first), contentReleaseManifestJson(second));
});
