import { PassThrough, Readable } from "node:stream";
import type { AppLoadContext, EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { renderToPipeableStream } from "react-dom/server";
import { checkDatabaseReady, getDb } from "./server/db/client";
import { assertLeadWebConfig, readLeadWebConfig } from "./server/leads/config";
import { createPrivateAttachmentStore } from "./server/leads/objectStore";
import { createLeadRepository } from "./server/leads/repository";
import { runLeadRetention as executeLeadRetention, type RetentionReport } from "./server/leads/retention";
import { readAdminAuthConfig } from "./server/auth/config";
import { readPublicMediaConfig } from "./server/media/config";
import { checkMcpReady } from "./server/mcp/runtime";
export { canonicalizeRequest } from "./server/http/canonical";
export { legacyProjectRedirect } from "./server/http/legacyProject";
export { checkDatabaseReady } from "./server/db/client";
export { createLeadRouter } from "./server/leads/http";
export { checkLeadWorkerReady, createLeadWorker } from "./server/leads/worker";
export { createMcpRouter } from "./server/mcp/http";
export { runSeoCollection, checkSeoCollectionReady } from "./server/seo-monitoring/runtime";

export async function runLeadRetention(options: { limit?: number } = {}): Promise<RetentionReport> {
  const config = readLeadWebConfig(process.env);
  const clock = { now: () => new Date() };
  return executeLeadRetention({
    repository: createLeadRepository(getDb(), clock),
    store: createPrivateAttachmentStore(config.s3),
    clock,
    limit: options.limit,
    logger: { write(record) { console.info(JSON.stringify(record)); } },
  });
}

export async function checkApplicationReady(): Promise<void> {
  await checkDatabaseReady();
  await checkMcpReady();
  assertLeadWebConfig(process.env);
  readAdminAuthConfig(process.env);
  readPublicMediaConfig(process.env);
}

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false;
    const nonce = request.headers.get("x-kordev-csp-nonce") ?? undefined;
    const { pipe } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
      {
        onAllReady() {
          shellRendered = true;
          const body = new PassThrough();
          responseHeaders.set("Content-Type", "text/html");
          responseHeaders.set("Cache-Control", "no-cache");
          pipe(body);
          resolve(
            new Response(Readable.toWeb(body) as ReadableStream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
        },
        onShellError: reject,
        onError(error) {
          responseStatusCode = 500;
          if (shellRendered) console.error(error);
        },
      },
    );
  });
}
