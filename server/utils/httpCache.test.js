const assert = require("node:assert/strict");
const test = require("node:test");

const { setPublicContentCache } = require("./httpCache");

test("public content responses use short stale-while-revalidate caching", () => {
  const headers = new Map();
  setPublicContentCache({
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
  });

  assert.equal(
    headers.get("cache-control"),
    "public, max-age=60, stale-while-revalidate=300",
  );
});
