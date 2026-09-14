import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type TestRuntime = {
  origin: string;
  output: () => string;
  close: () => Promise<void>;
};

async function getAvailablePort() {
  const server = createServer();

  return new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not allocate a test port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function waitForHealth(origin: string, output: () => string) {
  const deadline = Date.now() + 15_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `The SSR runtime did not become ready: ${String(lastError)}\n${output()}`,
  );
}

export async function startTestRuntime(environment: Record<string, string> = {}): Promise<TestRuntime> {
  const port = await getAvailablePort();
  const origin = `http://127.0.0.1:${port}`;
  const databaseDirectory = await mkdtemp(path.join(tmpdir(), "kordev-ssr-"));
  let output = "";
  const runtime = spawn(process.execPath, ["server/runtime.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      SQLITE_PATH: path.join(databaseDirectory, "content.sqlite"),
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      ...environment,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  runtime.stdout.on("data", (chunk) => {
    output += chunk;
  });
  runtime.stderr.on("data", (chunk) => {
    output += chunk;
  });

  try {
    await waitForHealth(origin, () => output);
  } catch (error) {
    runtime.kill("SIGTERM");
    await rm(databaseDirectory, { force: true, recursive: true });
    throw error;
  }

  return {
    origin,
    output: () => output,
    close: async () => {
      if (runtime.exitCode !== null) return;
      await new Promise<void>((resolve) => {
        runtime.once("exit", () => resolve());
        runtime.kill("SIGTERM");
      });
      await rm(databaseDirectory, { force: true, recursive: true });
    },
  };
}
