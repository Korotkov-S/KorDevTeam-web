import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { adminUsers, mcpTokens } from "../db/schema";
import { createGeoRepository } from "./repository";
import { createGeoQueueRepository } from "./queueRepository";
import { loadGeoPromptCatalog } from "./promptCatalog";
const url=process.env.TEST_DATABASE_URL??"",dbTest=url?test:test.skip;
const now=new Date("2026-10-05T06:00:00Z");
async function fixture(){
 await resetTestDatabase(url);const db=createDb(url);
 const [admin]=await db.insert(adminUsers).values({login:"safety",passwordDigest:"digest",passwordSalt:"salt"}).returning();
 const [token]=await db.insert(mcpTokens).values({adminUserId:admin.id,name:"safety",tokenHash:"1".repeat(64),tokenPrefix:"safe",scopes:["seo:read","seo:write"]}).returning();
 await createGeoRepository(db).syncPromptCatalog(loadGeoPromptCatalog());
 return {db,token:token.id,queue:createGeoQueueRepository(db)};
}
dbTest("GEO budget forbids a seventh question; Moscow day reset does not reset the original run window",async()=>{
 const f=await fixture(),works=await f.queue.claimWork({tokenId:f.token,now,limit:6});
 const questions=new Set<string>();
 for(const w of works)for(const p of w.prompts){questions.add(p.promptId);await f.queue.reserveAttempt({runId:w.runId,leaseId:w.leaseId,promptId:p.promptId,repetition:1,tokenId:f.token,now});}
 assert.equal(questions.size,6);
 const row=(await f.queue.listQueue({limit:200})).items.find(j=>!questions.has(j.promptId)&&j.state==="queued")!;
 const run=await f.queue.startManagedRun({platform:row.platform,surface:row.surface,mode:row.mode,language:row.language,region:row.region,promptIds:[row.promptId]},f.token,now);
 await assert.rejects(()=>f.queue.reserveAttempt({runId:run.id,leaseId:run.leaseId,promptId:row.promptId,repetition:1,tokenId:f.token,now}),/daily_budget/);
 const tomorrow=new Date("2026-10-05T21:01:00Z"),resumed=await f.queue.resumeRun({runId:run.id,tokenId:f.token,sessionPersonalized:false,now:tomorrow});
 assert.equal(resumed.runId,run.id);assert.equal(+resumed.deadline,+now+86400000);
 await f.queue.reserveAttempt({runId:run.id,leaseId:resumed.leaseId,promptId:row.promptId,repetition:1,tokenId:f.token,now:tomorrow});
});
dbTest("managed GEO refuses fabricated empty answers, expired lease writes, incomplete success and revoked tokens",async()=>{
 const f=await fixture(),[work]=await f.queue.claimWork({tokenId:f.token,now,limit:1}),promptId=work.prompts[0].promptId;
 const {attemptId}=await f.queue.reserveAttempt({runId:work.runId,leaseId:work.leaseId,promptId,repetition:1,tokenId:f.token,now});
 const input={attemptId,leaseId:work.leaseId,promptId,repetition:1 as const,mentioned:false,linked:false,cited:false,responseSnapshot:"",responseExcerpt:"",responseHash:createHash("sha256").update("").digest("hex"),snapshotTruncated:false,sourceCount:0,sessionPersonalized:false,mentions:[],citations:[],fanoutQueries:[]};
 const repo=createGeoRepository(f.db,()=>now);
 await assert.rejects(()=>repo.recordObservation(work.runId,f.token,input),/factual_response_required/);
 await assert.rejects(()=>repo.finishRun(work.runId,f.token,{status:"success",completedCount:3,storedCount:3,errorCode:null,metadata:{}}),/geo_run_counts_mismatch/);
 const expired=createGeoRepository(f.db,()=>new Date(+now+16*60000));
 await assert.rejects(()=>expired.recordObservation(work.runId,f.token,{...input,responseSnapshot:"Фактический тестовый ответ"}),/lease_expired/);
 await f.db.update(mcpTokens).set({revokedAt:now}).where(eq(mcpTokens.id,f.token));
 await assert.rejects(()=>f.queue.claimWork({tokenId:f.token,now,limit:1}),/token_inactive/);
 await assert.rejects(()=>repo.recordObservation(work.runId,f.token,{...input,responseSnapshot:"Фактический тестовый ответ"}),/token_inactive/);
});
