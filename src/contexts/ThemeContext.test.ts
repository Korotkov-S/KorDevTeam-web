import assert from "node:assert/strict";
import test from "node:test";
import { getInitialTheme, getStoredTheme } from "./ThemeContext";

test("theme hydration starts from one snapshot and restores saved preferences", () => {
  assert.equal(getInitialTheme(), "dark");
  assert.equal(getStoredTheme({ getItem: () => "light" }), "light");
  assert.equal(getStoredTheme({ getItem: () => "dark" }), "dark");
});
