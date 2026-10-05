import assert from "node:assert/strict";
import { test } from "node:test";
import { moscowDate, rankWeek, summarizeRankPlan, type RankJob } from "./rankQueue";
test("rank budget date and weekly plan use Moscow even around midnight", () => {
 const now=new Date("2026-10-04T21:30:00Z");
 assert.equal(moscowDate(now),"2026-10-05");
 assert.deepEqual(rankWeek(now),{from:"2026-10-05",to:"2026-10-11"});
});
test("rank progress exposes only stored results and no private operation identifiers", () => {
 const run={id:"run",checkDate:"2026-10-05",startedAt:new Date("2026-10-04T22:00:00Z"),completedAt:null,plannedCount:3,storedCount:0,status:"running",errorCode:null} as any;
 const jobs=[{state:"stored",checkedAt:new Date("2026-10-05T00:00:00Z")},{state:"polling",nextAttemptAt:new Date("2026-10-05T00:02:00Z"),operationId:"private-op"},{state:"blocked",errorCode:"seo_rank_submission_uncertain"}] as RankJob[];
 const p=summarizeRankPlan(run,jobs);
 assert.equal(p.storedCount,1);assert.equal(p.remainingCount,2);assert.equal(p.blockedCount,1);assert.equal(p.retryable,true);
 assert.equal(JSON.stringify(p).includes("private-op"),false);
 assert.equal(p.periodTo?.toISOString(),"2026-10-05T00:00:00.000Z");
});
