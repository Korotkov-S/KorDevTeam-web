import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { text } from "node:stream/consumers";
import test from "node:test";
import { createElement } from "react";
import { renderToPipeableStream, renderToString } from "react-dom/server";

test("React SSR streams multibyte text without inserting null bytes", async () => {
  const element = createElement("div", null, Array(700).fill("Москва → Пермь"));
  const output = new PassThrough();
  const html = await new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(element, {
      onAllReady() {
        pipe(output);
        text(output).then(resolve, reject);
      },
      onShellError: reject,
      onError: reject,
    });
  });

  assert.equal(html.includes("\0"), false, "HTML contains a null byte");
  assert.equal(html, renderToString(element));
});
