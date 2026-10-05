import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RankProgressPanel } from "./rankProgress";
test("partial 255 of 960 shows 705 missing and actual Moscow collection time", () => {
  const html = renderToStaticMarkup(
    <RankProgressPanel
      progress={{
        runId: "r",
        checkDate: "2026-10-05",
        status: "partial",
        plannedCount: 960,
        completedCount: 255,
        storedCount: 255,
        remainingCount: 705,
        blockedCount: 705,
        nextAttemptAt: null,
        periodFrom: new Date("2026-10-04T22:00:00Z"),
        periodTo: new Date("2026-10-05T00:00:00Z"),
        errorCode: "legacy_resume_unavailable",
        retryable: false,
      }}
    />,
  );
  for (const text of [
    "255 / 960",
    "705",
    "05.10.2026",
    "01:00",
    "Требуется действие",
    "Не проверено",
  ])
    assert.ok(html.includes(text));
  assert.equal(html.includes("вне топ-100"), false);
});
