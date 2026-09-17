import assert from "node:assert/strict";
import { test } from "node:test";

import { assertSafeArguments, parsePipedAdminInput } from "./create-admin";

test("accepts login and password only from two stdin lines", () => {
  assert.deepEqual(
    parsePipedAdminInput("owner\nочень-длинный-пароль-2026\n"),
    { login: "owner", password: "очень-длинный-пароль-2026" },
  );
});

test("rejects argv credentials and malformed piped input", () => {
  assert.throws(() => assertSafeArguments(["--password", "secret"]), /admin_bootstrap_arguments_invalid/);
  assert.throws(() => parsePipedAdminInput("owner\n"), /admin_bootstrap_input_invalid/);
  assert.throws(() => parsePipedAdminInput("owner\npassword\nextra\n"), /admin_bootstrap_input_invalid/);
});
