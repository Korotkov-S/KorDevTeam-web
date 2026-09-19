import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("src/styles/globals.css", "utf8");

function variables(block) {
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(match => [match[1], match[2]]));
}

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => Number.parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(left, right) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("filled public actions meet WCAG AA in light and dark themes", () => {
  const root = variables(css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? "");
  const dark = variables(css.match(/\.dark\s*\{([\s\S]*?)\n\}/)?.[1] ?? "");

  for (const [theme, tokens] of [["light", root], ["dark", dark]]) {
    assert.ok(tokens["public-action-foreground"], `${theme} action foreground token is required`);
    for (const background of [tokens["public-blue"], tokens["public-violet"]]) {
      assert.ok(contrast(tokens["public-action-foreground"], background) >= 4.5, `${theme} filled action contrast must be at least 4.5:1`);
    }
  }
});

test("public filled actions use the theme-aware foreground token", () => {
  for (const file of [
    "src/components/public/CtaLink.tsx",
    "src/components/public/ConsentBanner.tsx",
    "src/components/LeadForm.tsx",
    "src/pages/ServicePage.tsx",
    "src/pages/CommercialCasePage.tsx",
    "src/routes/legal.tsx",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /text-\[var\(--public-action-foreground\)\]/, `${file} must use the filled-action foreground token`);
  }
});
