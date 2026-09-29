import assert from "node:assert/strict";
import test from "node:test";

import { dailyLookbackWindow, moscowCalendarDate, splitDateWindows } from "./dateWindows";

test("Moscow calendar dates and daily windows stay correct across UTC boundaries", () => {
  assert.equal(moscowCalendarDate(new Date("2030-01-01T20:59:59.999Z")), "2030-01-01");
  assert.equal(moscowCalendarDate(new Date("2030-01-01T21:00:00.000Z")), "2030-01-02");
  assert.deepEqual(dailyLookbackWindow(new Date("2030-01-01T21:00:00.000Z")), {
    dateFrom: "2029-12-27",
    dateTo: "2030-01-02",
  });
  assert.deepEqual(dailyLookbackWindow(new Date("2032-03-01T00:30:00+05:00")), {
    dateFrom: "2032-02-23",
    dateTo: "2032-02-29",
  });
});

test("date windows are ascending, contiguous, non-overlapping and bounded", () => {
  assert.deepEqual(splitDateWindows("2029-12-29", "2030-01-07", 3), [
    { dateFrom: "2029-12-29", dateTo: "2029-12-31" },
    { dateFrom: "2030-01-01", dateTo: "2030-01-03" },
    { dateFrom: "2030-01-04", dateTo: "2030-01-06" },
    { dateFrom: "2030-01-07", dateTo: "2030-01-07" },
  ]);
  assert.deepEqual(splitDateWindows("2032-02-28", "2032-03-01", 2), [
    { dateFrom: "2032-02-28", dateTo: "2032-02-29" },
    { dateFrom: "2032-03-01", dateTo: "2032-03-01" },
  ]);
});

test("date helpers reject invalid, reversed, or unbounded inputs", () => {
  assert.throws(() => moscowCalendarDate(new Date("invalid")), /ads_vk_contract_invalid/u);
  assert.throws(() => splitDateWindows("2030-02-30", "2030-03-01", 3), /ads_vk_contract_invalid/u);
  assert.throws(() => splitDateWindows("2030-03-02", "2030-03-01", 3), /ads_vk_contract_invalid/u);
  assert.throws(() => splitDateWindows("2030-01-01", "2030-01-02", 0), /ads_vk_contract_invalid/u);
  assert.throws(() => splitDateWindows("2030-01-01", "2030-01-02", 367), /ads_vk_contract_invalid/u);
});
