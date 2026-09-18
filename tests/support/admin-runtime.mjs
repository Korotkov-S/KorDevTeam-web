import { spawn, spawnSync } from "node:child_process";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createServer as createNetServer } from "node:net";
import pg from "pg";

const scrypt = promisify(scryptCallback);

async function port() {
  const server = createNetServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

export function resetAdminTestDatabase(databaseUrl) {
  const code = `import { resetTestDatabase } from ${JSON.stringify(new URL("../../src/server/db/testDatabase.ts", import.meta.url).href)}; await resetTestDatabase(process.env.TEST_DATABASE_URL);`;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", code], {
    cwd: process.cwd(), env: { ...process.env, TEST_DATABASE_URL: databaseUrl }, encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`admin_test_database_reset_failed\n${result.stderr}`);
}

export async function createTestAdmin(databaseUrl, login = `owner-${randomBytes(5).toString("hex")}`) {
  const password = `Admin-${randomBytes(12).toString("base64url")}!`;
  const salt = randomBytes(32);
  const digest = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      `insert into admin_users (login, password_digest, password_salt) values ($1, $2, $3) returning id`,
      [login, Buffer.from(digest).toString("base64"), salt.toString("base64")],
    );
    return { id: result.rows[0].id, login, password };
  } finally { await client.end(); }
}

export async function startAdminRuntime(databaseUrl) {
  const runtimePort = await port();
  const tlsRoot = mkdtempSync(join(tmpdir(), "kordev-admin-tls-"));
  const keyPath = join(tlsRoot, "key.pem");
  const certPath = join(tlsRoot, "cert.pem");
  const certificate = spawnSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyPath, "-out", certPath, "-subj", "/CN=localhost", "-days", "1",
  ], { encoding: "utf8" });
  if (certificate.status !== 0) {
    rmSync(tlsRoot, { recursive: true, force: true });
    throw new Error(`admin_tls_certificate_failed\n${certificate.stderr}`);
  }
  const origin = `https://localhost:${runtimePort}`;
  const sessionKey = randomBytes(32).toString("base64");
  const rateKey = randomBytes(32).toString("base64");
  let output = "";
  const child = spawn(process.execPath, ["server/runtime.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(runtimePort),
      TRUST_PROXY_HOPS: "0",
      DATABASE_URL: databaseUrl,
      TEST_TLS_KEY_PATH: keyPath,
      TEST_TLS_CERT_PATH: certPath,
      ADMIN_SESSION_HMAC_KEY: sessionKey,
      ADMIN_RATE_LIMIT_HMAC_KEY: rateKey,
      ADMIN_TRUSTED_ORIGIN: origin,
      PUBLIC_MEDIA_S3_ENDPOINT: "https://s3.example.invalid",
      PUBLIC_MEDIA_S3_REGION: "test-1",
      PUBLIC_MEDIA_S3_BUCKET: "public-test",
      PUBLIC_MEDIA_S3_ACCESS_KEY_ID: "fixture-access",
      PUBLIC_MEDIA_S3_SECRET_ACCESS_KEY: "fixture-secret",
      PUBLIC_MEDIA_S3_PREFIX: "media",
      PUBLIC_MEDIA_BASE_URL: "https://cdn.example.invalid/",
      PUBLIC_MEDIA_S3_SSE: "AES256",
      LEAD_CONSENT_VERSION: "test",
      LEAD_HASH_KEY: randomBytes(32).toString("base64"),
      LEAD_TEMP_ROOT: "/tmp/kordev-leads",
      LEAD_S3_ENDPOINT: "https://s3.example.invalid",
      LEAD_S3_REGION: "test-1",
      LEAD_S3_BUCKET: "private-test",
      LEAD_S3_ACCESS_KEY_ID: "fixture-access",
      LEAD_S3_SECRET_ACCESS_KEY: "fixture-secret",
      LEAD_S3_PREFIX: "leads/",
      LEAD_S3_SSE: "AES256",
      CLAMAV_HOST: "clamav.example.invalid",
      CLAMAV_PORT: "3310",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  const healthy = () => new Promise(resolve => {
    const request = httpsRequest(`${origin}/api/health`, { rejectUnauthorized: false }, response => {
      response.resume();
      response.once("end", () => resolve((response.statusCode ?? 500) < 500));
    });
    request.once("error", () => resolve(false));
    request.end();
  });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await healthy()) break;
    if (child.exitCode !== null) throw new Error(`admin_runtime_exited\n${output}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (Date.now() >= deadline) throw new Error(`admin_runtime_timeout\n${output}`);
  return {
    origin,
    output: () => output,
    async close() {
      if (child.exitCode === null) {
        await new Promise(resolve => {
          const force = setTimeout(() => child.kill("SIGKILL"), 2_000);
          child.once("exit", () => {
            clearTimeout(force);
            resolve();
          });
          child.kill("SIGTERM");
        });
      }
      rmSync(tlsRoot, { recursive: true, force: true });
    },
  };
}

export function requestAdminRuntime(origin, path) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(new URL(path, origin), { rejectUnauthorized: false }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.once("end", () => resolve({
        status: response.statusCode ?? 500,
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    request.once("error", reject);
    request.end();
  });
}

export async function closeAdminBrowser(browser) {
  const process = browser.process();
  browser.disconnect();
  if (!process || process.exitCode !== null) return;
  await new Promise(resolve => {
    const force = setTimeout(() => process.kill("SIGKILL"), 2_000);
    process.once("exit", () => {
      clearTimeout(force);
      resolve();
    });
    process.kill("SIGTERM");
  });
}

export async function loginAdmin(page, origin, admin) {
  await page.goto(`${origin}/admin/login/`, { waitUntil: "networkidle2" });
  await page.type('input[name="login"]', admin.login);
  await page.type('input[name="password"]', admin.password);
  const requests = [];
  const recordRequest = request => {
    if (request.method() === "POST") requests.push(new URL(request.url()).pathname);
  };
  page.on("request", recordRequest);
  const responsePromise = page.waitForResponse(response =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/admin/login.data",
    { timeout: 30_000 },
  );
  await page.click('button[type="submit"]');
  const response = await responsePromise;
  try {
    await page.waitForFunction(() => location.pathname === "/admin/", { timeout: 5_000 });
  } catch (error) {
    const cookies = (await page.cookies()).map(cookie => cookie.name).join(",");
    const pageText = (await page.$eval("body", element => element.textContent ?? "")).trim().slice(0, 500);
    const validity = await page.$eval('input[name="login"]', element => element.validationMessage);
    const responseText = (await response.text()).slice(0, 500).replaceAll(admin.password, "[redacted]");
    throw new Error(`admin_login_failed:status=${response.status()}:url=${page.url()}:posts=${requests.join(",")}:cookies=${cookies}:validity=${validity}:response=${responseText}:page=${pageText}`, { cause: error });
  } finally {
    page.off("request", recordRequest);
  }
  if (!page.url().endsWith("/admin/")) throw new Error(`admin_login_failed:${page.url()}`);
}
