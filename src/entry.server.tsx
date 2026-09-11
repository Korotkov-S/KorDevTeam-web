import { PassThrough, Readable } from "node:stream";
import type { AppLoadContext, EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { renderToPipeableStream } from "react-dom/server";
export { canonicalizeRequest } from "./server/http/canonical";
export { legacyProjectRedirect } from "./server/http/legacyProject";

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false;
    const { pipe } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
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
