import assert from "node:assert/strict";
import { test } from "node:test";

import { mediaObjectKeys, publicMediaUrl } from "./keys";

const checksum = "a".repeat(64);

test("creates stable content-addressed keys without an original filename", () => {
  const keys = mediaObjectKeys(checksum, "image/png", [640, 1280], "media");
  assert.deepEqual(keys, {
    original: `media/v1/aa/${checksum}/original.png`,
    variants: {
      "640": `media/v1/aa/${checksum}/640.webp`,
      "1280": `media/v1/aa/${checksum}/1280.webp`,
    },
  });
  assert.doesNotMatch(JSON.stringify(keys), /client-name|\.\.\//);
  assert.equal(publicMediaUrl(new URL("https://cdn.kordev.team/"), keys.variants[640]),
    `https://cdn.kordev.team/media/v1/aa/${checksum}/640.webp`);
});

test("rejects malformed hashes, unsupported MIME and unsafe prefixes", () => {
  assert.throws(() => mediaObjectKeys("bad", "image/png", [640], "media"), /media_key_invalid/);
  assert.throws(() => mediaObjectKeys(checksum, "image/gif", [640], "media"), /media_key_invalid/);
  assert.throws(() => mediaObjectKeys(checksum, "image/png", [640], "../media"), /media_key_invalid/);
});
