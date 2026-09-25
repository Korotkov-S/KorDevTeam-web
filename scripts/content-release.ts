import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadContentReleaseBundle } from "../src/server/content-release/manifest";
import {
  applyRelease,
  planRelease,
  verifyRelease,
} from "../src/server/content-release/orchestrator";
import { createDb } from "../src/server/db/client";

type ContentReleaseArgs =
  | { command: "manifest" | "plan" | "verify" }
  | {
    command: "apply";
    releaseSha: string;
    manifestChecksum: string;
    planChecksum: string;
  };

const sha1 = /^[0-9a-f]{40}$/;
const sha256 = /^[0-9a-f]{64}$/;

export function parseContentReleaseArgs(args: readonly string[]): ContentReleaseArgs {
  if (args.length === 1 && new Set(["manifest", "plan", "verify"]).has(args[0])) {
    return { command: args[0] as "manifest" | "plan" | "verify" };
  }
  if (args[0] === "apply" && args.length === 7) {
    const values = new Map<string, string>();
    for (let index = 1; index < args.length; index += 2) {
      const name = args[index];
      const value = args[index + 1];
      if (!new Set(["--release-sha", "--manifest-sha256", "--plan-sha256"]).has(name) || values.has(name)) {
        throw new Error("content_release_invalid_arguments");
      }
      values.set(name, value);
    }
    const releaseSha = values.get("--release-sha");
    const manifestChecksum = values.get("--manifest-sha256");
    const planChecksum = values.get("--plan-sha256");
    if (!releaseSha || !manifestChecksum || !planChecksum || !sha1.test(releaseSha)
      || !sha256.test(manifestChecksum) || !sha256.test(planChecksum)) {
      throw new Error("content_release_invalid_arguments");
    }
    return { command: "apply", releaseSha, manifestChecksum, planChecksum };
  }
  throw new Error("content_release_invalid_arguments");
}

function releaseSha(environment: NodeJS.ProcessEnv): string {
  const value = environment.RELEASE_SHA ?? "";
  if (!sha1.test(value)) throw new Error("content_release_release_sha_invalid");
  return value;
}

function databaseUrl(environment: NodeJS.ProcessEnv): string {
  const value = environment.DATABASE_URL;
  if (!value) throw new Error("content_release_database_url_missing");
  return value;
}

function safeErrorCode(error: unknown): string {
  if (error instanceof Error && /^content_release_[a-z0-9_:-]+$/.test(error.message)) return error.message;
  return "content_release_runtime_error";
}

export async function runContentRelease(
  parsed: ContentReleaseArgs,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, unknown>> {
  const bakedReleaseSha = releaseSha(environment);
  const bundle = await loadContentReleaseBundle();
  if (parsed.command === "manifest") {
    return {
      ok: true,
      command: "manifest",
      releaseSha: bakedReleaseSha,
      manifestChecksum: bundle.manifest.checksum,
      counts: bundle.manifest.counts,
    };
  }

  const db = createDb(databaseUrl(environment));
  if (parsed.command === "plan") {
    const plan = await planRelease(db, bundle.manifest);
    return {
      ok: true,
      command: "plan",
      manifestChecksum: plan.manifestChecksum,
      planChecksum: plan.planChecksum,
      blocked: plan.blocked,
      counts: plan.counts,
      items: plan.items.map(item => ({ key: item.key, action: item.action })),
    };
  }
  if (parsed.command === "apply") {
    if (parsed.releaseSha !== bakedReleaseSha) throw new Error("content_release_release_sha_mismatch");
    if (parsed.manifestChecksum !== bundle.manifest.checksum) throw new Error("content_release_manifest_changed");
    const counts = await applyRelease(db, bundle, {
      releaseSha: parsed.releaseSha,
      manifestChecksum: parsed.manifestChecksum,
      planChecksum: parsed.planChecksum,
    });
    return {
      ok: true,
      command: "apply",
      releaseSha: bakedReleaseSha,
      manifestChecksum: bundle.manifest.checksum,
      planChecksum: parsed.planChecksum,
      counts,
    };
  }

  const verification = await verifyRelease(db, bundle.manifest);
  const mismatches = [...verification.issues];
  if (verification.releaseSha !== bakedReleaseSha) {
    mismatches.push({ key: "$release", code: "release_sha_mismatch" });
  }
  return {
    ok: verification.ok && mismatches.length === 0,
    command: "verify",
    releaseSha: bakedReleaseSha,
    manifestChecksum: bundle.manifest.checksum,
    mismatches,
  };
}

export async function main(
  args = process.argv.slice(2),
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  let command = args[0] ?? "unknown";
  try {
    const parsed = parseContentReleaseArgs(args);
    command = parsed.command;
    const report = await runContentRelease(parsed, environment);
    process.stdout.write(`${JSON.stringify(report)}\n`);
    process.stderr.write(`content-release command=${command} ok=${String(report.ok)}\n`);
    if (report.ok === false) process.exitCode = 1;
  } catch (error) {
    const code = safeErrorCode(error);
    process.stdout.write(`${JSON.stringify({ ok: false, command, error: code })}\n`);
    process.stderr.write(`content-release command=${command} ok=false error=${code}\n`);
    process.exitCode = 1;
  }
}

const executable = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (executable === import.meta.url) void main();
