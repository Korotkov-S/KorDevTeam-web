import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

type ComposePort = {
  host_ip?: string;
  published?: string;
  target?: number;
};

test("PostgreSQL development port resolves to loopback only", () => {
  const result = spawnSync("docker", ["compose", "config", "--format", "json"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);

  const config = JSON.parse(result.stdout) as {
    services: { postgres: { ports: ComposePort[] } };
  };
  const databasePort = config.services.postgres.ports.find(
    (port) => port.published === "5433" && port.target === 5432,
  );

  assert.equal(databasePort?.host_ip, "127.0.0.1");
});
