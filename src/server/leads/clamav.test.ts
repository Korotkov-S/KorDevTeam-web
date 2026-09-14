import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ClamAvScanner } from "./clamav";
import { LeadError } from "./errors";

async function fixture(t: test.TestContext, reply: (socket: Socket, wire: Buffer) => void) {
  const root = await mkdtemp(join(tmpdir(), "lead-scan-"));
  const path = join(root, "file");
  const bytes = Buffer.alloc(180_123, 0x7b);
  await writeFile(path, bytes);
  const sockets = new Set<Socket>();
  const server = createServer({ allowHalfOpen: true }, socket => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    const parts: Buffer[] = [];
    socket.on("data", part => parts.push(part));
    socket.on("end", () => reply(socket, Buffer.concat(parts)));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { path, bytes, scanner: new ClamAvScanner({ host: "127.0.0.1", port: address.port, timeoutMs: 150 }) };
}

test("INSTREAM sends the exact command, all file bytes in BE chunks and a zero terminator", async t => {
  let wire: Buffer | undefined;
  const f = await fixture(t, (socket, data) => { wire = data; socket.end("stream: OK\0"); });
  const result = await f.scanner.scan(f.path);
  assert.deepEqual(result.scanMetadata, { engine: "ClamAV", result: "OK" });
  assert.ok(result.scannedAt instanceof Date);
  assert.equal(wire!.subarray(0, 10).toString(), "zINSTREAM\0");
  let offset = 10;
  const chunks: Buffer[] = [];
  while (true) {
    const length = wire!.readUInt32BE(offset); offset += 4;
    if (!length) break;
    chunks.push(wire!.subarray(offset, offset + length)); offset += length;
  }
  assert.ok(chunks.length > 1);
  assert.equal(offset, wire!.length);
  assert.deepEqual(Buffer.concat(chunks), f.bytes);
});

for (const [reply, code] of [
  ["stream: Eicar-Signature FOUND\0", "unsafe_file"],
  ["stream: OK\0junk", "scan_unavailable"],
  ["stream: OK", "scan_unavailable"],
  ["stream: OK\n", "scan_unavailable"],
  ["stream: size limit exceeded. ERROR\0", "scan_unavailable"],
  ["x".repeat(2048), "scan_unavailable"],
  ["", "scan_unavailable"],
] as const) test(`scanner rejects ${JSON.stringify(reply.slice(0, 45))}`, async t => {
  const f = await fixture(t, socket => socket.end(reply));
  await assert.rejects(f.scanner.scan(f.path), error => error instanceof LeadError && error.code === code && !error.message.includes("Eicar"));
});

test("one deadline bounds a daemon that keeps sending bytes without finishing", async t => {
  const f = await fixture(t, socket => {
    const timer = setInterval(() => socket.write("x"), 20);
    socket.on("close", () => clearInterval(timer));
  });
  const start = Date.now();
  await assert.rejects(f.scanner.scan(f.path), /scan_unavailable/);
  assert.ok(Date.now() - start < 1500);
});

test("file read failures are sanitized", async t => {
  const f = await fixture(t, socket => socket.end("stream: OK\0"));
  await assert.rejects(f.scanner.scan(`${f.path}-missing`), /scan_unavailable/);
});
