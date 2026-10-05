import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  readFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("rank recovery shell passes resume-only to validated immutable worker and fails closed for unsafe state", (t) => {
  const dir = realpathSync(
    mkdtempSync(join(tmpdir(), "kordev-rank-recovery-")),
  );
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, "bin"),
    state = join(dir, "state"),
    log = join(dir, "calls");
  mkdirSync(bin);
  mkdirSync(state);
  const image = `ghcr.io/test/web@sha256:${"a".repeat(64)}`;
  writeFileSync(join(state, "worker-image"), image, { mode: 0o600 });
  writeFileSync(
    join(bin, "docker"),
    '#!/bin/bash\nprintf "%s\\n" "$WORKER_IMAGE" "$*" >> "$RECOVERY_LOG"\n',
    { mode: 0o700 },
  );
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    DEPLOY_STATE_DIR: state,
    RECOVERY_LOG: log,
  };
  const result = spawnSync("bash", ["scripts/run-seo-rank-recover.sh"], {
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const calls = readFileSync(log, "utf8");
  assert.ok(calls.includes(image));
  assert.ok(calls.includes("--resume-yandex-rank"));
  assert.equal(calls.includes("--source=yandex-rank"), false);
  assert.equal(calls.includes("lead-worker"), false);
  chmodSync(join(state, "worker-image"), 0o644);
  const bad = spawnSync("bash", ["scripts/run-seo-rank-recover.sh"], {
    env,
    encoding: "utf8",
  });
  assert.equal(bad.status, 1);
  assert.equal(readFileSync(log, "utf8"), calls);
});
