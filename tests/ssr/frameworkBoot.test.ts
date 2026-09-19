import assert from "node:assert/strict";
import test from "node:test";
import { startTestRuntime } from "./support/runtime";
import { seoSnapshot } from "./support/seoSnapshot";
import { resetTestDatabase } from "../../src/server/db/testDatabase";
import { createDb } from "../../src/server/db/client";
import { contentEntries } from "../../src/server/db/schema";
import { importLegacyContent } from "../../scripts/migrate-content-to-postgres";
import { seedHomeServices } from "./support/homeFixtures";
import { and, eq } from "drizzle-orm";

test("one runtime serves health and server-rendered home", async (t) => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "TEST_DATABASE_URL must point to dedicated kordev_test");
  await resetTestDatabase(databaseUrl);
  await importLegacyContent({ db: createDb(databaseUrl), batchId: "home-structure" });
  await seedHomeServices(databaseUrl);
  const serviceDescriptions = await createDb(databaseUrl)
    .select({ description: contentEntries.seoDescription })
    .from(contentEntries)
    .where(and(eq(contentEntries.kind, "service"), eq(contentEntries.status, "published")));
  assert.equal(
    new Set(serviceDescriptions.map(({ description }) => description)).size,
    serviceDescriptions.length,
    "every service fixture must have a unique SEO description",
  );
  const runtime = await startTestRuntime();
  t.after(runtime.close);

  const health = await fetch(`${runtime.origin}/api/health`).then((response) =>
    response.json(),
  );
  assert.equal(health.status, "ok");

  const response = await fetch(`${runtime.origin}/`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(seoSnapshot(html).h1.length, 1);
  assert.ok(seoSnapshot(html).h1[0].length > 20);
  for (const id of ["home-hero", "proof", "cases", "services", "krasotula", "process", "contact"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /95%|8 недель|83%/);
  const priorityPaths = ["business-process-automation", "web-services", "mobile-app-development"].map(slug => html.indexOf(`href="/services/${slug}/"`));
  assert.ok(priorityPaths.every(index => index >= 0));
  assert.ok(priorityPaths[0] < priorityPaths[1] && priorityPaths[1] < priorityPaths[2]);
  assert.ok(priorityPaths[2] < html.indexOf('href="/services/additional-service/"'));
  assert.doesNotMatch(html, /PRIVATE_SERVICE_SENTINEL/);
  assert.match(html, /<script[^>]+type="module"/);
  assert.match(html, /<form[^>]*>/);
  for (const name of ["name", "phone", "description", "file", "consent", "website", "pagePath"]) {
    assert.match(html, new RegExp(`name="${name}"`));
  }
  assert.match(html, /href="\/privacy\/"/);
  assert.match(html, /Ответим в течение рабочего дня/);
  assert.match(html, /Пн–Пт, 09:00–18:00 по Москве/);
  assert.doesNotMatch(html, /type="hidden"[^>]+name="(?:email|company|service|budget)"/);
});
