import assert from "node:assert/strict";
import test from "node:test";
import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { adminUsers, contentEntries, seoChanges } from "../db/schema";
import { parseAdminContentCommand } from "./contentSchemas";
import { saveContentInTransaction } from "./contentWrite";
const url = process.env.TEST_DATABASE_URL ?? "";
(url ? test : test.skip)("shared_writer_returns_actual_events_and_never_commits_independently", async () => {
  await resetTestDatabase(url); const db = createDb(url);
  const [actor] = await db.insert(adminUsers).values({ login: "writer", passwordDigest: "unused", passwordSalt: "unused" }).returning();
  const command = parseAdminContentCommand({ kind: "article", slug: "test", title: "Текст", seoTitle: "Текст", seoDescription: "Описание", intent: "publish", relations: [], mediaRefs: [] });
  await assert.rejects(db.transaction(async tx => { const result = await saveContentInTransaction(tx, command, { adminUserId: actor.id }); assert.equal(result.publicationChanges[0].contentEntryId, result.entry.id); throw Error("rollback"); }), /rollback/);
  assert.equal((await db.select().from(contentEntries)).length, 0); assert.equal((await db.select().from(seoChanges)).length, 0);
});
