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

const runtimeSecurityDefaults = {
  ADMIN_SESSION_HMAC_KEY: Buffer.alloc(32, 1).toString("base64"),
  ADMIN_RATE_LIMIT_HMAC_KEY: Buffer.alloc(32, 2).toString("base64"),
  ADMIN_TRUSTED_ORIGIN: "https://kordev.team",
  PUBLIC_MEDIA_S3_ENDPOINT: "https://s3.example.invalid",
  PUBLIC_MEDIA_S3_REGION: "test-1",
  PUBLIC_MEDIA_S3_BUCKET: "public-test",
  PUBLIC_MEDIA_S3_ACCESS_KEY_ID: "fixture-access",
  PUBLIC_MEDIA_S3_SECRET_ACCESS_KEY: "fixture-secret",
  PUBLIC_MEDIA_S3_PREFIX: "media",
  PUBLIC_MEDIA_BASE_URL: "https://cdn.example.invalid/",
  PUBLIC_MEDIA_S3_SSE: "AES256",
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
      ...runtimeSecurityDefaults,
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
