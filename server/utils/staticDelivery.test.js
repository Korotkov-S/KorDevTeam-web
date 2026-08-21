const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  ONE_YEAR_SECONDS,
  parseAcceptedEncodings,
  resolvePrecompressedAsset,
  setGeneralStaticHeaders,
  setPrecompressedAssetHeaders,
} = require("./staticDelivery");

function createResponseMock() {
  const headers = new Map();
  return {
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    type(value) {
      headers.set("content-type-extension", value);
    },
  };
}

test("parseAcceptedEncodings ignores disabled encodings", () => {
  assert.deepEqual(parseAcceptedEncodings("gzip;q=0, br;q=1"), [
    { name: "br", quality: 1 },
  ]);
});

test("resolvePrecompressedAsset prefers Brotli and blocks traversal", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kordev-assets-"));
  const asset = path.join(root, "index-ABC12345.js");
  fs.writeFileSync(asset, "console.log('asset')");
  fs.writeFileSync(`${asset}.br`, "brotli");
  fs.writeFileSync(`${asset}.gz`, "gzip");

  const resolved = resolvePrecompressedAsset(
    root,
    "index-ABC12345.js",
    "gzip, br",
  );
  assert.equal(resolved.encoding, "br");
  assert.equal(resolved.compressedPath, `${asset}.br`);
  assert.equal(resolvePrecompressedAsset(root, "../secret", "br"), null);
});

test("static delivery emits immutable and safe HTML cache headers", () => {
  const compressedResponse = createResponseMock();
  setPrecompressedAssetHeaders(
    compressedResponse,
    "br",
    "/app/dist/assets/index-ABC12345.js",
  );
  assert.equal(
    compressedResponse.getHeader("content-type-extension"),
    ".js",
  );
  assert.equal(compressedResponse.getHeader("content-encoding"), "br");
  assert.equal(compressedResponse.getHeader("vary"), "Accept-Encoding");
  assert.equal(
    compressedResponse.getHeader("cache-control"),
    `public, max-age=${ONE_YEAR_SECONDS}, immutable`,
  );

  const htmlResponse = createResponseMock();
  setGeneralStaticHeaders(htmlResponse, "/app/index.html");
  assert.equal(htmlResponse.getHeader("cache-control"), "no-cache");
});
