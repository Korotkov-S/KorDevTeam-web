import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

import { parseContentReleaseArgs } from "../../scripts/content-release";

test("content release CLI parser accepts only the four pinned command shapes", () => {
  assert.deepEqual(parseContentReleaseArgs(["manifest"]), { command: "manifest" });
  assert.deepEqual(parseContentReleaseArgs(["plan"]), { command: "plan" });
  assert.deepEqual(parseContentReleaseArgs(["verify"]), { command: "verify" });
  assert.deepEqual(parseContentReleaseArgs([
    "apply",
    "--release-sha",
    "a".repeat(40),
    "--manifest-sha256",
    "b".repeat(64),
    "--plan-sha256",
    "c".repeat(64),
  ]), {
    command: "apply",
    releaseSha: "a".repeat(40),
    manifestChecksum: "b".repeat(64),
    planChecksum: "c".repeat(64),
  });

  for (const args of [["apply"], ["unknown"], ["plan", "--extra"]]) {
    assert.throws(() => parseContentReleaseArgs(args), /content_release_invalid_arguments/);
  }
});

function runCli(args: string[], environment: Record<string, string>) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/content-release.ts", ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => stdout += chunk);
    child.stderr.on("data", chunk => stderr += chunk);
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
  });
}

test("content release CLI failures expose only a safe code", async () => {
  const databaseSecret = "database-password-sentinel";
  const articleSecret = "Новый полный практический текст статьи";
  const result = await runCli(["plan"], {
    RELEASE_SHA: "a".repeat(40),
    DATABASE_URL: `postgresql://kordev:${databaseSecret}@127.0.0.1:1/kordev`,
  });

  assert.equal(result.code, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    ok: false,
    command: "plan",
    error: "content_release_runtime_error",
  });
  assert.equal(result.stderr.trim().split("\n").length, 1);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(databaseSecret));
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(articleSecret));
  assert.doesNotMatch(result.stderr, /\n\s*at\s|Error:/);
});

test("manifest command is deterministic and bound to the baked release SHA", async () => {
  const releaseSha = "f".repeat(40);
  const first = await runCli(["manifest"], { RELEASE_SHA: releaseSha });
  const second = await runCli(["manifest"], { RELEASE_SHA: releaseSha });

  assert.equal(first.code, 0, first.stderr);
  assert.equal(second.code, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  const report = JSON.parse(first.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.command, "manifest");
  assert.equal(report.releaseSha, releaseSha);
  assert.deepEqual(report.counts, { article: 46, case: 23, service: 7, faq: 69 });
});
