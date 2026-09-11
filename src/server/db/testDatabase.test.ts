import assert from "node:assert/strict";
import test from "node:test";

import { assertTestDatabaseUrl } from "./testDatabase";

test("reset guard rejects the ordinary application database before destructive SQL", () => {
  assert.throws(
    () => assertTestDatabaseUrl("postgresql://kordev:kordev@localhost:5433/kordev"),
    /kordev_test/,
  );
});

test("reset guard accepts the dedicated test database", () => {
  assert.doesNotThrow(() =>
    assertTestDatabaseUrl("postgresql://kordev:kordev@localhost:5433/kordev_test"),
  );
});
