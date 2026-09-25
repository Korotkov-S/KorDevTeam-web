import assert from "node:assert/strict";
import { test } from "node:test";

import { decodePage, encodePageCursor, pageOf } from "./pagination";

test("pagination rejects malformed cursors and out-of-bounds limits", () => {
  for (const cursor of ["%%%", Buffer.from("not-json").toString("base64url"), Buffer.from(JSON.stringify({ offset: -1 })).toString("base64url"), Buffer.from(JSON.stringify({ offset: 1.5 })).toString("base64url")]) {
    assert.throws(() => decodePage(cursor), /mcp_pagination_invalid/);
  }
  for (const limit of [0, 101, 1.5]) assert.throws(() => decodePage(undefined, limit), /mcp_pagination_invalid/);
});

test("pagination cursor round-trips an integer offset", () => {
  const cursor = encodePageCursor(25);
  assert.deepEqual(decodePage(cursor, 20), { offset: 25, limit: 20 });
  assert.deepEqual(decodePage(undefined), { offset: 0, limit: 50 });
});

test("pageOf slices results and only emits a cursor when rows remain", () => {
  assert.deepEqual(pageOf([1, 2, 3, 4], { offset: 0, limit: 2 }), {
    items: [1, 2],
    nextCursor: encodePageCursor(2),
  });
  assert.deepEqual(pageOf([1, 2, 3, 4], { offset: 2, limit: 2 }), { items: [3, 4] });
});
