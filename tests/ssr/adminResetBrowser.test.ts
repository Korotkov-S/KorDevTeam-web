import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { test } from "node:test";
import puppeteer from "puppeteer";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test_port_unavailable");
  const port = address.port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

test("reset link hydrates under admin CSP and removes the bearer token from browser history", async () => {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn("./node_modules/.bin/react-router", ["dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: process.cwd(),
    stdio: "ignore",
    env: {
      ...process.env,
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:9/kordev_test",
      ADMIN_SESSION_HMAC_KEY: Buffer.alloc(32, 1).toString("base64"),
      ADMIN_RATE_LIMIT_HMAC_KEY: Buffer.alloc(32, 2).toString("base64"),
      ADMIN_TRUSTED_ORIGIN: origin,
    },
  });
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${origin}/admin/reset-password/`);
        if (response.ok) break;
      } catch { /* Dev server is still starting. */ }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    const response = await page.goto(`${origin}/admin/reset-password/?token=${"A".repeat(43)}`, { waitUntil: "networkidle0" });
    assert.equal(response?.status(), 200);
    assert.equal(response?.headers()["cache-control"], "no-store");
    assert.equal(response?.headers()["referrer-policy"], "no-referrer");
    await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", { timeout: 5_000 });
    assert.equal(new URL(page.url()).search, "");
    assert.equal(await page.$$('input[name="resetToken"]').then(inputs => inputs.length), 1);
    assert.equal(await page.$$('input[name="newPassword"]').then(inputs => inputs.length), 1);
    await page.type('input[name="newPassword"]', "test-password-first");
    await page.type('input[name="confirmPassword"]', "test-password-second");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent === "Пароли не совпадают.");
    assert.equal(await page.$eval('input[name="resetToken"]', input => (input as HTMLInputElement).value), "A".repeat(43));
  } finally {
    await browser?.close();
    server.kill("SIGTERM");
  }
});
