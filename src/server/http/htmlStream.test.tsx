import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToPipeableStream, renderToStaticMarkup } from "react-dom/server";
import { createHtmlResponseStream } from "./htmlStream";

test("streamed Russian HTML preserves the text across UTF-8 buffer boundaries", async () => {
  const tree = <main>{Array.from({ length: 100 }, (_, i) => <p key={i} className="a">Разрабатываем приложения для сотрудников и клиентов.</p>)}</main>;
  const body = createHtmlResponseStream();
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    body.on("data", chunk => chunks.push(Buffer.from(chunk)));
    body.on("end", () => resolve(Buffer.concat(chunks)));
    body.on("error", reject);
  });
  const render = renderToPipeableStream(tree, { onAllReady() { render.pipe(body); }, onError(error) { body.destroy(error as Error); } });
  const result = await completed;
  assert.equal(result.includes(0), false, "HTML must not contain NUL padding between Cyrillic letters");
  assert.equal(result.toString("utf8"), renderToStaticMarkup(tree));
});
