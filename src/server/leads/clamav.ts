import { createReadStream } from "node:fs";
import { createConnection } from "node:net";
import { MAX_FILE_BYTES } from "./contracts";
import type { LeadWebConfig } from "./config";
import { LeadError } from "./errors";

export type CleanScan = { scanMetadata: Record<string, string>; scannedAt: Date };

export class ClamAvScanner {
  constructor(private readonly config: LeadWebConfig["clamav"]) {}

  scan(path: string): Promise<CleanScan> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: this.config.host, port: this.config.port });
      const source = createReadStream(path, { highWaterMark: 65_536 });
      let settled = false, sent = false, received = Buffer.alloc(0);
      const finish = (error?: LeadError) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        source.destroy();
        socket.destroy();
        if (error) reject(error);
        else resolve({ scanMetadata: { engine: "ClamAV", result: "OK" }, scannedAt: new Date() });
      };
      const unavailable = () => finish(new LeadError("scan_unavailable"));
      // This timer covers connect, all writes, and the complete response. It
      // cannot be extended by a peer dribbling data or acknowledging chunks.
      const deadline = setTimeout(unavailable, this.config.timeoutMs);
      source.on("error", unavailable);
      socket.on("error", unavailable);
      socket.on("close", () => { if (!settled) unavailable(); });
      socket.on("data", (bytes: Buffer) => {
        if (received.length + bytes.length > 1024) return unavailable();
        received = Buffer.concat([received, bytes]);
      });
      socket.on("end", () => {
        if (!sent) return unavailable();
        if (received.equals(Buffer.from("stream: OK\0"))) return finish();
        if (/^stream: [\x20-\x7e]{1,255} FOUND\0$/.test(received.toString("latin1"))) return finish(new LeadError("unsafe_file"));
        unavailable();
      });
      const write = (bytes: Buffer) => new Promise<void>((done, fail) => {
        socket.write(bytes, error => error ? fail(error) : done());
      });
      socket.once("connect", () => {
        void (async () => {
          await write(Buffer.from("zINSTREAM\0"));
          let size = 0;
          for await (const chunk of source) {
            const bytes = chunk as Buffer;
            size += bytes.length;
            if (settled || size > MAX_FILE_BYTES) throw new Error("scan_unavailable");
            const length = Buffer.alloc(4);
            length.writeUInt32BE(bytes.length);
            await write(length);
            await write(bytes);
          }
          if (!size || settled) throw new Error("scan_unavailable");
          sent = true;
          socket.end(Buffer.alloc(4));
        })().catch(unavailable);
      });
    });
  }
}
