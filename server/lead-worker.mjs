import { randomUUID } from "node:crypto";

const argumentsList = process.argv.slice(2);

async function main() {
  if (argumentsList.length > 1 || (argumentsList.length === 1 && argumentsList[0] !== "--check")) {
    throw new Error("lead_worker_arguments_invalid");
  }

  const build = await import("../build/server/index.js");
  if (argumentsList[0] === "--check") {
    await build.entry.module.checkLeadWorkerReady();
    return;
  }

  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    const run = build.entry.module.createLeadWorker({ ownerId: randomUUID(), signal: controller.signal });
    await run();
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
}

try {
  await main();
} catch {
  console.error("Lead worker failed.");
  process.exitCode = 1;
}
