import assert from "node:assert/strict";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../db/client";
import { adminUsers, contentEntries, contentRevisions } from "../db/schema";
import { resetTestDatabase } from "../db/testDatabase";
import { createAdminContentRepository } from "../admin/contentRepository";
import { parseAdminContentCommand } from "../admin/contentSchemas";
import { createContentService } from "./service";
import { parseContentCommand, type SaveContentCommand } from "./types";
import { contentErrorStatus } from "../../routes/admin/content-http.server";
import { safeContentWriteError } from "./provenance";

const url = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = url ? test : test.skip;
const source = (id = "1265") => ({ telegramPostId: id, telegramSourceUrl: `https://t.me/korotkovsStudio/${id}`, contentOrigin: "telegram:korotkovsStudio" });
const command = (slug: string, payload: Record<string, unknown> = source(), indexable = false): SaveContentCommand => ({
  kind: "article", slug, title: "Практическая статья", seoTitle: "Статья", seoDescription: "Описание", bodyMd: "Практический процесс", indexable, payload,
});

test("Telegram source requires a complete matching provenance triple", () => {
  for (const payload of [{ telegramPostId: "1265" }, { telegramSourceUrl: "https://t.me/korotkovsStudio/1265" },
    { contentOrigin: "telegram:korotkovsStudio" }, { ...source(), telegramSourceUrl: "https://t.me/korotkovsStudio/1264" }]) {
    assert.throws(() => parseContentCommand(command("source-validation", payload)), /content_validation_error/);
  }
  assert.equal(parseContentCommand(command("source-valid")).payload.telegramPostId, "1265");
  assert.deepEqual(parseContentCommand(command("ordinary-valid", {})).payload, {});
});

test("source conflicts and immutable provenance have safe HTTP conflict statuses", () => {
  assert.equal(contentErrorStatus(new Error("content_source_conflict")), 409);
  assert.equal(contentErrorStatus(new Error("content_provenance_immutable")), 409);
});

test("content write errors unwrap only known constraints with a bounded cycle-safe traversal", () => {
  const nested = new Error("private SQL", { cause: { code: "23505", constraint: "content_entries_telegram_post_uq" } });
  assert.equal(safeContentWriteError(nested).message, "content_source_conflict");
  assert.equal(safeContentWriteError({ code: "23505", constraint: "content_entries_telegram_url_uq" }).message, "content_source_conflict");
  assert.equal(safeContentWriteError({ code: "23505", constraint: "content_entries_kind_slug_uq" }).message, "content_slug_conflict");
  assert.equal(safeContentWriteError({ code: "23514", constraint: "content_entries_telegram_valid" }).message, "content_validation_error");
  const unknown = new Error("unrelated", { cause: { code: "23505", constraint: "content_revisions_entry_version_uq" } });
  assert.equal(safeContentWriteError(unknown), unknown);
  const cycle: { cause?: unknown } = {}; cycle.cause = cycle;
  assert.equal(safeContentWriteError(cycle).message, "content_write_failed");
});

async function setup() {
  await resetTestDatabase(url);
  const db = createDb(url);
  const [actor] = await db.insert(adminUsers).values({ login: "source-owner", passwordDigest: "unused", passwordSalt: "unused" }).returning();
  const admin = createAdminContentRepository(db), generic = createContentService(db);
  const adapters = [
    { name: "admin", save: (input: SaveContentCommand) => admin.save(parseAdminContentCommand({ ...input, intent: "draft", relations: [], mediaRefs: [] }), actor.id),
      restore: (id: string, version: number, current: number) => admin.restore(id, version, current, actor.id) },
    { name: "generic", save: (input: SaveContentCommand) => generic.saveDraft(input, actor.id),
      restore: (id: string, version: number, current: number) => generic.restoreRevision(id, version, current, actor.id) },
  ];
  return { db, actor, admin, generic, adapters };
}

databaseTest("both repositories reject indexable new Telegram drafts and preserve ordinary defaults", async () => {
  const { adapters } = await setup();
  for (const a of adapters) {
    await assert.rejects(() => a.save(command(`${a.name}-unsafe`, source(), true)), /content_validation_error/);
    const ordinary = await a.save(command(`${a.name}-ordinary`, {}, true));
    assert.equal(ordinary.indexable, true);
    const safe = await a.save(command(`${a.name}-safe`, source(a.name === "admin" ? "1265" : "1266")));
    assert.equal(safe.status, "draft"); assert.equal(safe.indexable, false);
  }
});

databaseTest("concurrent cross-repository intake reserves the Telegram source exactly once", async () => {
  const { db, adapters } = await setup();
  const results = await Promise.allSettled(adapters.map(a => a.save(command(`${a.name}-duplicate`))));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const failure = results.find(r => r.status === "rejected");
  assert.ok(failure?.status === "rejected"); assert.equal(failure.reason.message, "content_source_conflict");
  assert.equal((await db.select().from(contentEntries)).length, 1);
});

databaseTest("published Telegram source still prevents a second draft", async () => {
  const { admin, actor, adapters } = await setup();
  const live = await admin.save(parseAdminContentCommand({ ...command("live-source", source(), true), intent: "publish", relations: [], mediaRefs: [] }), actor.id);
  assert.equal(live.status, "published"); assert.equal(live.indexable, true);
  for (const a of adapters) await assert.rejects(() => a.save(command(`${a.name}-live-duplicate`)), /content_source_conflict/);
});

databaseTest("both repositories preserve assigned provenance across edits and restoration", async () => {
  const { db, adapters } = await setup();
  for (const [i, a] of adapters.entries()) {
    const slug = `${a.name}-immutable`, payload = source(String(1300 + i));
    const first = await a.save(command(slug, payload));
    const changed = await a.save({ ...command(slug, payload), id: first.id, expectedVersion: 1, title: "Уточнено" });
    assert.equal(changed.version, 2);
    for (const nextPayload of [{}, source(String(1400 + i))]) await assert.rejects(() => a.save({ ...command(slug, nextPayload), id: first.id, expectedVersion: 2 }), /content_provenance_immutable/);
    const restored = await a.restore(first.id, 1, 2);
    assert.equal(restored.version, 3); assert.deepEqual(restored.payload, payload);
    assert.equal((await db.select().from(contentRevisions).where(eq(contentRevisions.entryId, first.id))).length, 2);
  }
});

databaseTest("restoring a pre-provenance revision cannot silently release the source", async () => {
  const { db, adapters } = await setup();
  for (const [i, a] of adapters.entries()) {
    const slug = `${a.name}-restore-source`;
    const first = await a.save(command(slug, {}));
    await a.save({ ...command(slug, source(String(1500 + i))), id: first.id, expectedVersion: 1 });
    await assert.rejects(() => a.restore(first.id, 1, 2), /content_provenance_immutable/);
    const [current] = await db.select().from(contentEntries).where(eq(contentEntries.id, first.id));
    assert.equal(current.version, 2); assert.equal(current.payload.telegramPostId, String(1500 + i));
    assert.equal((await db.select().from(contentRevisions).where(eq(contentRevisions.entryId, first.id))).length, 1);
  }
});

databaseTest("source conflict on an update rolls back its revision and leaves the original reservation", async () => {
  const { db, adapters } = await setup();
  await adapters[0].save(command("original-reservation"));
  for (const a of adapters) {
    const draft = await a.save(command(`${a.name}-unclaimed`, {}));
    await assert.rejects(() => a.save({ ...command(draft.slug), id: draft.id, expectedVersion: 1 }), /content_source_conflict/);
    assert.equal((await db.select().from(contentEntries).where(eq(contentEntries.id, draft.id)))[0].version, 1);
    assert.equal((await db.select().from(contentRevisions).where(eq(contentRevisions.entryId, draft.id))).length, 0);
  }
});

databaseTest("source migration rejects legacy duplicates without merging or deleting either entry", async () => {
  const { db } = await setup();
  await db.execute(sql`ALTER TABLE content_entries DROP CONSTRAINT content_entries_telegram_valid`);
  await db.execute(sql`DROP INDEX content_entries_telegram_post_uq, content_entries_telegram_url_uq`);
  await db.execute(sql`DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1791459000000`);
  await db.insert(contentEntries).values(["legacy-one", "legacy-two"].map(slug => parseContentCommand(command(slug))));
  await assert.rejects(() => migrate(db, { migrationsFolder: "drizzle" }));
  assert.equal((await db.select().from(contentEntries)).length, 2);
  const history = await db.execute(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations WHERE created_at = 1791459000000`);
  assert.equal(history.rows[0].n, 0);
});
