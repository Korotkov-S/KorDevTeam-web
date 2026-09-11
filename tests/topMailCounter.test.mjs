import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("Top.Mail.Ru records the page view and loads its tracker asynchronously", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const trackerSource = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .find((source) => source.includes("window._tmr"));

  assert.ok(trackerSource, "Top.Mail.Ru tracker script is missing");

  const insertedScripts = [];
  const firstScript = {
    parentNode: {
      insertBefore(script, reference) {
        insertedScripts.push({ script, reference });
      },
    },
  };
  const document = {
    getElementById() {
      return null;
    },
    createElement(tagName) {
      return { tagName };
    },
    getElementsByTagName(tagName) {
      assert.equal(tagName, "script");
      return [firstScript];
    },
  };
  const window = {};

  vm.runInNewContext(trackerSource, { Date, document, window });

  assert.equal(window._tmr.length, 1);
  assert.equal(window._tmr[0].id, "3793508");
  assert.equal(window._tmr[0].type, "pageView");
  assert.equal(typeof window._tmr[0].start, "number");
  assert.equal(insertedScripts.length, 1);
  assert.equal(insertedScripts[0].reference, firstScript);
  assert.equal(insertedScripts[0].script.id, "tmr-code");
  assert.equal(insertedScripts[0].script.async, true);
  assert.equal(insertedScripts[0].script.src, "https://top-fwz1.mail.ru/js/code.js");
});

test("Top.Mail.Ru exposes its tracking pixel when JavaScript is disabled", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const noscriptBlocks = [...html.matchAll(/<noscript(?:\s[^>]*)?>([\s\S]*?)<\/noscript>/gi)];
  const trackerFallback = noscriptBlocks
    .map((match) => match[1])
    .find((content) => content.includes("top-fwz1.mail.ru/counter"));

  assert.ok(trackerFallback, "Top.Mail.Ru noscript fallback is missing");
  assert.match(trackerFallback, /<img\s[^>]*src="https:\/\/top-fwz1\.mail\.ru\/counter\?id=3793508;js=na"[^>]*>/i);
});
