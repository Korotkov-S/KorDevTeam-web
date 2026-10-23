import assert from "node:assert/strict";
import test from "node:test";
import { createViewSessionStore } from "./sessionStore";
test("unavailable IndexedDB skips recording rather than inventing per-page sessions", async () => {
  const store = createViewSessionStore();
  assert.equal(await store.getOrCreate(0), null);
  assert.equal(await store.rotate("old", 0), null);
  assert.equal(await store.noteActivity(0), null);
  assert.equal(await store.claimActivitySend("old", 0), false);
  await assert.doesNotReject(() => store.clear());
});
