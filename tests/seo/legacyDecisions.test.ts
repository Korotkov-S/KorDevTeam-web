import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createDb } from "../../src/server/db/client";
import { resetTestDatabase } from "../../src/server/db/testDatabase";
import { createContentService } from "../../src/server/content/service";
import { legacyProjectRedirect } from "../../src/server/http/legacyProject";
import { importLegacyContent } from "../../scripts/migrate-content-to-postgres";
import { adminUsers } from "../../src/server/db/schema";

type LegacyDecisionRow = {
  path: string;
  action: string;
  target: string | null;
};

const discoveredLegacyPaths = [
  "/project/Media%20%26%20Entertainment/",
  "/project/Media%20&%20Entertainment/",
  "/project/media-entertainment/",
  "/project/web-site/",
  "/project/web-service/",
  "/project/harmonize-me/",
  "/project/stroyrem/",
  "/project/wowbanner/",
  "/project/serviceplus/",
  "/project/amch/",
  "/project/notion-analog/",
] as const;

async function readLegacyDecisionTable(pathname: string): Promise<LegacyDecisionRow[]> {
  const source = await readFile(pathname, "utf8").catch(() => "");
  return source
    .split("\n")
    .filter(line => /^\|\s*`\/project\//.test(line))
    .map(line => {
      const cells = line.split("|").slice(1, -1).map(cell => cell.trim().replace(/^`|`$/g, ""));
      return { path: cells[0], action: cells[1], target: cells[2] === "—" ? null : cells[2] };
    });
}

test("every repository-discovered legacy project has one explicit decision", async () => {
  const rows = await readLegacyDecisionTable("docs/seo/legacy-url-decisions.md");
  const paths = rows.map(row => row.path);
  assert.deepEqual(paths.sort(), [...discoveredLegacyPaths].sort());
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(rows.every(row => ["keep", "redirect", "noindex", "gone"].includes(row.action)));
  assert.ok(rows.filter(row => row.action === "redirect").every(row => row.target?.startsWith("/cases/") && row.target.endsWith("/")));
});

test("legacy project redirects are allowlisted rather than inferred from newly published cases", { timeout: 60_000 }, async t => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "TEST_DATABASE_URL must point to dedicated kordev_test");
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  t.after(() => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });
  await resetTestDatabase(databaseUrl);
  const db = createDb(databaseUrl);
  await importLegacyContent({ db, batchId: "legacy-decisions" });
  const actor = randomUUID();
  await db.insert(adminUsers).values({
    id: actor,
    login: "legacy-decisions-admin",
    passwordDigest: "unused",
    passwordSalt: "unused",
  });
  const service = createContentService(db);
  const draft = await service.saveDraft({
    kind: "case",
    slug: "new-published-case",
    title: "Новый кейс без старого URL",
    seoTitle: "Новый кейс",
    seoDescription: "Новый опубликованный кейс не получает выдуманный legacy URL.",
  }, actor);
  await service.publishEntry(draft.id, draft.version, actor);

  const inferred = await legacyProjectRedirect(new Request(
    "https://kordev.team/project/new-published-case/?utm_source=test&deploy=bad",
    { headers: { accept: "text/html" } },
  ));
  assert.equal(inferred, null);

  const approved = await legacyProjectRedirect(new Request(
    "https://kordev.team/project/web-site/?utm_source=test&deploy=bad",
    { headers: { accept: "text/html" } },
  ));
  assert.equal(approved?.href, "https://kordev.team/cases/web-site/?utm_source=test");
});
