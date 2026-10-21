import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { createDb } from "../../src/server/db/client";
import { resetTestDatabase } from "../../src/server/db/testDatabase";
import { contentEntries } from "../../src/server/db/schema";
import { CONSENT_VERSION } from "../../src/lib/consent";
import { startTestRuntime } from "./support/runtime";
test("built runtime GET/HEAD/prefetch never write, eligible POST counts once", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  await resetTestDatabase(process.env.TEST_DATABASE_URL!);
  const db = createDb(process.env.TEST_DATABASE_URL!);
  const [entry] = await db.insert(contentEntries).values({ kind: "article", slug: "article", title: "Article", status: "published" }).returning();
  const runtime = await startTestRuntime({ CONTENT_VIEWS_ENABLED: "true", LEAD_HASH_KEY: Buffer.alloc(32, 7).toString("base64") }); t.after(runtime.close);
  const endpoint = `${runtime.origin}/api/content-views`;
  for (const method of ["GET", "HEAD"]) assert.equal((await fetch(`${endpoint}/record`, { method })).status, 405);
  const headers = { origin: runtime.origin, "sec-fetch-site": "same-origin", "content-type": "application/json" };
  const sessionToken = Buffer.alloc(32, 1).toString("base64url");
  const body = { entryId: entry.id, sessionToken, consentVersion: CONSENT_VERSION };
  assert.equal((await fetch(`${endpoint}/record`, { method: "POST", headers: { ...headers, purpose: "prefetch" }, body: JSON.stringify(body) })).status, 403);
  assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM content_view_receipts`)).rows[0].n, 0);
  assert.equal((await fetch(`${endpoint}/session`, { method: "POST", headers, body: JSON.stringify({ operation: "register", sessionToken, consentVersion: CONSENT_VERSION }) })).status, 200);
  for (const counted of [true, false]) {
    const response = await fetch(`${endpoint}/record`, { method: "POST", headers, body: JSON.stringify(body) }); assert.equal(response.status, 200); assert.equal((await response.json()).counted, counted);
  }
  assert.equal((await db.execute(sql`SELECT views::text FROM content_view_totals`)).rows[0].views, "1");
  assert.equal((await fetch(`${runtime.origin}/api/health`)).status, 200);
  assert.equal((await fetch(`${runtime.origin}/api/leads`)).status, 405);
  assert.equal((await fetch(`${runtime.origin}/api/vk/leads/not-a-token`)).status, 404);
  assert.doesNotMatch(runtime.output(), new RegExp(sessionToken));
});
