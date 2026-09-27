import assert from "node:assert/strict";
import test from "node:test";

import { classifyAiReferral } from "./referrals";

test("AI referral classifier recognizes only verified exact/subdomain signals", () => {
  assert.equal(classifyAiReferral({ refererDomain: "chatgpt.com", refererPath: "/", utmSource: "" }), "chatgpt_search");
  assert.equal(classifyAiReferral({ refererDomain: "chat.openai.com", refererPath: "/", utmSource: "" }), "chatgpt_search");
  assert.equal(classifyAiReferral({ refererDomain: "gemini.google.com", refererPath: "/app", utmSource: "" }), "google_ai");
  assert.equal(classifyAiReferral({ refererDomain: "copilot.microsoft.com", refererPath: "/", utmSource: "" }), "bing_copilot");
  assert.equal(classifyAiReferral({ refererDomain: "", refererPath: "", utmSource: " ChatGPT.com " }), "chatgpt_search");
  assert.equal(classifyAiReferral({ refererDomain: "", refererPath: "", utmSource: "google_ai" }), "google_ai");
  assert.equal(classifyAiReferral({ refererDomain: "", refererPath: "", utmSource: "bing-copilot" }), "bing_copilot");
});

test("AI referral classifier rejects suffix attacks, generic search, direct traffic, and ambiguous Alice signals", () => {
  for (const refererDomain of ["chatgpt.com.evil.example", "evilchatgpt.com", "google.com", "bing.com", "yandex.ru", ""]) {
    assert.equal(classifyAiReferral({ refererDomain, refererPath: "/", utmSource: "" }), null);
  }
  for (const utmSource of ["", "google", "bing", "yandex", "alice", "chatgpt.com.evil.example"]) {
    assert.equal(classifyAiReferral({ refererDomain: "", refererPath: "", utmSource }), null);
  }
});
