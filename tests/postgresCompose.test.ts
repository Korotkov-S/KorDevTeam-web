import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("PostgreSQL development service does not publish a host port", () => {
  const result = spawnSync("docker", ["compose", "config", "--format", "json"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);

  const config = JSON.parse(result.stdout) as { services: { postgres: { ports?: unknown } } };
  assert.equal(config.services.postgres.ports, undefined);
});
