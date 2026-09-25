import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("SEO runbook covers credentials, collection, MCP, diagnosis, and safe disabling", () => {
  const text = readFileSync("docs/runbooks/seo-monitoring.md", "utf8");
  for (const pattern of [
    /Яндекс Вебмастер/u, /Search Console/u, /base64/u, /--check/u, /--source=yandex/u, /--source=google/u,
    /seo:read/u, /seo:write/u, /429/u, /partial/u, /Google.*задерж/isu, /не удаляет.*истори/isu,
    /systemctl enable --now kordevteam-seo-collect\.timer/u, /ротац/iu,
  ]) assert.match(text, pattern);
});
test("operations environment documents disabled-by-default SEO switches and every credential", () => {
  const text = readFileSync("deploy/env/operations.env.example", "utf8");
  for (const name of ["SEO_YANDEX_ENABLED=false", "YANDEX_WEBMASTER_OAUTH_TOKEN=", "YANDEX_WEBMASTER_HOST_ID=",
    "SEO_GOOGLE_ENABLED=false", "GOOGLE_SEARCH_CONSOLE_SITE_URL=", "GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL=",
    "GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY_B64="]) assert.match(text, new RegExp(`^${name}`, "mu"));
});
