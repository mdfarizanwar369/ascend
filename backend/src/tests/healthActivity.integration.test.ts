import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";
import { HEALTH_ACTIVITY_CONSENT_VERSION,healthDateKey,type HealthActivityImport } from "@ascend/shared";

const testUrl = process.env.ASCEND_HARDENING_TEST_DATABASE_URL;
const users: string[] = [];
let db: typeof import("../db/pool");
let service: typeof import("../services/healthActivityService");
async function account() {
  const id=randomUUID(); users.push(id);
  await db.query("insert into users(id,firebase_uid,email,full_name,created_at) values($1,$2,$3,'Health fixture',now()-interval '60 days')",[id,`test-${id}`,`${id}@example.invalid`]);
  return id;
}
async function connection(userId: string,installationId=randomUUID(),select=false) {
  return { installationId,...await service.connectHealthActivity(userId,{ installationId,timezone:"Asia/Singapore",consentVersion:HEALTH_ACTIVITY_CONSENT_VERSION,select }) };
}
function snapshot(calories=600,daysAgo=0) {
  const day=healthDateKey(new Date(Date.now()-daysAgo*86400_000),"Asia/Singapore");
  const start=new Date(`${day}T00:00:00+08:00`);
  return { day,timezone:"Asia/Singapore",windowStart:start.toISOString(),windowEnd:new Date(+start+86400_000).toISOString(),observedAt:new Date().toISOString(),steps:8000,stepsState:"observed" as const,activeCalories:calories,energyState:"observed" as const };
}
function packet(source: Awaited<ReturnType<typeof connection>>,sequence=1,calories=600): HealthActivityImport {
  return { schemaVersion:2,requestId:randomUUID(),installationId:source.installationId,connectionGeneration:source.connection.generation,
    calendarGeneration:source.calendarGeneration,sequence,snapshots:[snapshot(calories)],workouts:[],deletedWorkoutIds:[] };
}

describe.skipIf(!testUrl)("Apple activity ledger in isolated PostgreSQL",() => {
  beforeAll(async () => {
    const url=new URL(testUrl!);
    if (url.hostname!=="127.0.0.1" || url.pathname!=="/ascend_hardening_test") throw new Error("Only the isolated hardening test database is permitted");
    vi.stubEnv("DATABASE_URL",testUrl!); vi.stubEnv("APPLE_HEALTH_SYNC_V1","true"); vi.stubEnv("DAILY_ACTIVITY_LEDGER_V1","true"); vi.stubEnv("APPLE_HEALTH_USER_IDS","");
    db=await import("../db/pool"); service=await import("../services/healthActivityService");
  });
  afterAll(async () => {
    if (db) { await db.query("delete from users where id=any($1::uuid[])",[users]); await db.pool.end(); }
    vi.unstubAllEnvs();
  });
  it("accepts immutable retries exactly once even concurrently",async () => {
    const id=await account(),source=await connection(id),input=packet(source);
    const results=await Promise.all(Array.from({ length:6 },() => service.importHealthActivity(id,input)));
    expect(results.filter(result => result.duplicate)).toHaveLength(5);
    expect((await service.getDailyHealthActivity(id))?.displayedCalories).toBe(600);
    expect(Number((await db.query("select count(*) from health_activity_import_requests where source_id=$1",[source.connection.id])).rows[0].count)).toBe(1);
  });
  it("rejects mutation of an acknowledged request and stale sequences",async () => {
    const id=await account(),source=await connection(id),input=packet(source);
    await service.importHealthActivity(id,input);
    await expect(service.importHealthActivity(id,{ ...input,snapshots:[snapshot(900)] })).rejects.toThrow("original payload");
    await expect(service.importHealthActivity(id,packet(source,0))).rejects.toThrow("newer device observation");
  });
  it("replaces corrected totals downward and accepts observed zero",async () => {
    const id=await account(),source=await connection(id);
    for (const [sequence,value] of [[1,600],[2,540],[3,0]]) {
      await service.importHealthActivity(id,packet(source,sequence,value));
      expect((await service.getDailyHealthActivity(id))?.displayedCalories).toBe(value);
    }
  });
  it("keeps last good energy when only steps remain readable",async () => {
    const id=await account(),source=await connection(id);
    await service.importHealthActivity(id,packet(source));
    const input=packet(source,2); input.snapshots[0]={ ...input.snapshots[0],activeCalories:null,energyState:"unavailable",steps:10000 };
    await service.importHealthActivity(id,input);
    expect(await service.getDailyHealthActivity(id)).toMatchObject({ displayedCalories:600,steps:10000,coverage:"stale_provider_daily" });
  });
  it("never imports another account's generation or installation",async () => {
    const owner=await account(),other=await account(),source=await connection(owner);
    await expect(service.importHealthActivity(other,packet(source))).rejects.toThrow("connection changed");
    expect((await service.exportHealthActivity(other)).snapshots).toEqual([]);
  });
  it("rotates the generation on disconnect and rejects delayed imports",async () => {
    const id=await account(),source=await connection(id);
    await service.importHealthActivity(id,packet(source));
    await service.disconnectHealthActivity(id,source.installationId);
    await expect(service.importHealthActivity(id,packet(source,2))).rejects.toThrow("connection changed");
    const reconnected=await connection(id,source.installationId);
    expect(reconnected.connection.generation).not.toBe(source.connection.generation);
  });
  it("keeps the old phone until a requested new source supplies energy",async () => {
    const id=await account(),old=await connection(id);
    await service.importHealthActivity(id,packet(old));
    const next=await connection(id,randomUUID(),true);
    expect(next.connection).toMatchObject({ selected:false,pendingSelection:true });
    const missing=packet(next); missing.snapshots[0]={ ...missing.snapshots[0],activeCalories:null,energyState:"unavailable" };
    await service.importHealthActivity(id,missing);
    expect((await service.getDailyHealthActivity(id))?.displayedCalories).toBe(600);
    await service.importHealthActivity(id,packet(next,2,500));
    expect((await service.getDailyHealthActivity(id))?.displayedCalories).toBe(500);
    await service.importHealthActivity(id,packet(old,2,900));
    expect((await service.getDailyHealthActivity(id))?.displayedCalories).toBe(500);
  });
  it("keeps each past day's source during a switch and later correction",async () => {
    const id=await account(),old=await connection(id),input=packet(old); input.snapshots.push(snapshot(450,1));
    await service.importHealthActivity(id,input);
    const next=await connection(id,randomUUID(),true),incoming=packet(next,1,500); incoming.snapshots.push(snapshot(900,1));
    await service.importHealthActivity(id,incoming);
    expect((await service.getDailyHealthActivity(id,snapshot(0,1).day))?.displayedCalories).toBe(450);
    const correction=packet(old,2); correction.snapshots=[snapshot(420,1)]; await service.importHealthActivity(id,correction);
    expect((await service.getDailyHealthActivity(id,snapshot(0,1).day))?.displayedCalories).toBe(420);
  });
  it("upserts workout identities and honors deletion tombstones",async () => {
    const id=await account(),source=await connection(id),input=packet(source);
    input.workouts=[{ externalId:"watch-workout",startAt:new Date(Date.now()-3600_000).toISOString(),endAt:new Date().toISOString(),activityType:"Strength",activeCalories:350,sourceName:"Fixture Watch" }];
    await service.importHealthActivity(id,input);
    await service.importHealthActivity(id,{ ...input,requestId:randomUUID(),sequence:2 });
    expect((await service.exportHealthActivity(id)).workouts).toHaveLength(1);
    await service.importHealthActivity(id,{ ...packet(source,3),deletedWorkoutIds:["watch-workout"] });
    expect((await service.exportHealthActivity(id)).workouts).toHaveLength(0);
    expect((await service.getDailyHealthActivity(id))?.displayedCalories).toBe(600);
  });
  it("does not share imported records or derived Momentum through legacy tables",async () => {
    const id=await account(),source=await connection(id); await service.importHealthActivity(id,packet(source));
    const { getPrivateHealthInsights }=await import("../services/privateHealthInsightsService");
    const privateResult=await getPrivateHealthInsights(id);
    expect(privateResult.momentum).not.toBeNull();
    for (const table of ["health_sync_records","momentum_scores_v2","compliance_scores","weekly_reports"]) {
      expect(Number((await db.query(`select count(*) from ${table} where user_id=$1`,[id])).rows[0].count)).toBe(0);
    }
  });
  it("deletes one source's imports while preserving manual records and another source",async () => {
    const id=await account(),source=await connection(id),other=await connection(id);
    await service.importHealthActivity(id,packet(source)); await service.importHealthActivity(id,packet(other));
    const manual=randomUUID();
    await db.query("insert into analytics_events(id,user_id,event_name,metadata) values($1,$2,'burn_log',$3)",[manual,id,JSON.stringify({ caloriesBurned:100 })]);
    await service.disconnectHealthActivity(id,source.installationId,true);
    expect((await service.exportHealthActivity(id)).snapshots).toHaveLength(1);
    expect((await db.query("select id from analytics_events where id=$1",[manual])).rows).toHaveLength(1);
    expect((await service.getDailyHealthActivity(id))?.displayedCalories).toBe(100);
  });
  it("cascades all imported history when its owning account is deleted",async () => {
    const id=await account(),source=await connection(id); await service.importHealthActivity(id,packet(source));
    await db.query("delete from users where id=$1",[id]);
    expect((await db.query("select id from health_activity_sources where id=$1",[source.connection.id])).rows).toEqual([]);
    expect((await db.query("select source_id from health_activity_snapshots where source_id=$1",[source.connection.id])).rows).toEqual([]);
  });
  it("rotates reporting calendars without rebucketing completed historical days",async () => {
    // Keep the historical fixture clear of both today's Singapore and UTC
    // calendar days, including during the midnight crossover between them.
    const historicalDay=snapshot(450,2);
    const id=await account(),source=await connection(id),input=packet(source); input.snapshots.push(historicalDay);
    await service.importHealthActivity(id,input);
    await service.changeHealthReportingTimezone(id,"UTC",source.calendarGeneration);
    await expect(service.importHealthActivity(id,packet(source,2))).rejects.toThrow("connection changed");
    const status=await service.getHealthActivityStatus(id);
    expect(status.calendarGeneration).not.toBe(source.calendarGeneration);
    const updated=packet(source,3,300); updated.calendarGeneration=status.calendarGeneration!;
    const utcDay=healthDateKey(new Date(),"UTC");
    updated.snapshots=updated.snapshots.map(day => ({ ...day,day:utcDay,timezone:"UTC",windowStart:`${utcDay}T00:00:00.000Z`,windowEnd:new Date(Date.parse(`${utcDay}T00:00:00Z`)+86400_000).toISOString() }));
    await service.importHealthActivity(id,updated);
    expect(await service.getDailyHealthActivity(id,historicalDay.day)).toMatchObject({ displayedCalories:450,timezone:"Asia/Singapore" });
    expect(await service.getDailyHealthActivity(id)).toMatchObject({ displayedCalories:300,timezone:"UTC" });
  });
  it("rebuilds workout identity state transactionally after an explicit anchor reset",async () => {
    const id=await account(),source=await connection(id),input=packet(source);
    const workout={ externalId:"stale-workout",startAt:new Date(Date.now()-3600_000).toISOString(),endAt:new Date().toISOString(),activityType:"Walk",activeCalories:150,sourceName:"Fixture Watch" };
    input.workouts=[workout]; await service.importHealthActivity(id,input);
    const reset={ ...packet(source,2),workoutRebuild:{ id:randomUUID(),since:new Date(Date.now()-86400_000).toISOString(),complete:true },workouts:[{ ...workout,externalId:"current-workout" }] };
    await service.importHealthActivity(id,reset); await service.importHealthActivity(id,reset);
    expect((await service.exportHealthActivity(id)).workouts.map(row => row.external_id)).toEqual(["current-workout"]);
    expect((await service.getDailyHealthActivity(id))?.displayedCalories).toBe(600);
  });
  it("retains existing workouts until the final page of an interrupted anchor rebuild",async () => {
    const id=await account(),source=await connection(id),input=packet(source);
    const workout={ externalId:"retained-workout",startAt:new Date(Date.now()-3600_000).toISOString(),endAt:new Date().toISOString(),activityType:"Walk",activeCalories:150,sourceName:"Fixture Watch" };
    input.workouts=[workout]; await service.importHealthActivity(id,input);
    const rebuild={ id:randomUUID(),since:new Date(Date.now()-86400_000).toISOString(),complete:false };
    await service.importHealthActivity(id,{ ...packet(source,2),workoutRebuild:rebuild,workouts:[{ ...workout,externalId:"first-page" }] });
    expect((await service.exportHealthActivity(id)).workouts).toHaveLength(2);
    await expect(service.importHealthActivity(id,{ ...packet(source,3),workoutRebuild:{ ...rebuild,since:new Date(Date.now()-1000).toISOString() } })).rejects.toThrow("original interval");
    await service.importHealthActivity(id,{ ...packet(source,4),workoutRebuild:{ ...rebuild,complete:true },workouts:[workout] });
    expect((await service.exportHealthActivity(id)).workouts.map(row => row.external_id).sort()).toEqual(["first-page","retained-workout"]);
  });
  it("returns only the signed-in member's selected workout history",async () => {
    const owner=await account(),other=await account(),source=await connection(owner),input=packet(source);
    const workoutDay=snapshot().day;
    input.workouts=[{ externalId:"private-workout",startAt:new Date(`${workoutDay}T12:00:00+08:00`).toISOString(),endAt:new Date(`${workoutDay}T13:00:00+08:00`).toISOString(),activityType:"Strength",activeCalories:350,sourceName:"Fixture Watch" }];
    await service.importHealthActivity(owner,input);
    expect((await service.getHealthWorkoutHistory(owner,snapshot().day)).workouts).toHaveLength(1);
    expect((await service.getHealthWorkoutHistory(other,snapshot().day)).workouts).toHaveLength(0);
  });
});
