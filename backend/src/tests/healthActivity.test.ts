import { describe,expect,it } from "vitest";
import { estimatedNetActiveCalories,healthDateKey,reconcileDailyActivity,validHealthTimezone,type HealthDailySnapshot,type HealthManualActivity } from "@ascend/shared";
import { healthActivityImportSchema } from "../routes/healthActivity";

const snapshot: HealthDailySnapshot = { day:"2026-10-04",timezone:"Asia/Singapore",windowStart:"2026-10-03T16:00:00Z",windowEnd:"2026-10-04T16:00:00Z",observedAt:"2026-10-04T08:00:00Z",steps:8000,stepsState:"observed",activeCalories:600,energyState:"observed" };
const workout = { externalId:"workout-1",startAt:"2026-10-04T05:00:00Z",endAt:"2026-10-04T06:00:00Z",activityType:"strength",activeCalories:350,sourceName:"Apple Watch" };
const manual: HealthManualActivity = { id:"manual-1",label:"Strength",occurredAt:"2026-10-04T06:00:00Z",activeCalories:300,legacyCalories:350,untracked:false,matchedWorkoutId:null };
const summary = (changes: Partial<Parameters<typeof reconcileDailyActivity>[0]> = {}) => reconcileDailyActivity({ day:snapshot.day,timezone:snapshot.timezone,provider:"apple_health",snapshot,workouts:[workout],manual:[],...changes });

describe("daily active calorie reconciliation",() => {
  it("does not add workout or step calories to daily energy",() => expect(summary()).toMatchObject({ displayedCalories:600,steps:8000,workoutCount:1 }));
  it("does not use the larger of manual and provider energy",() => expect(summary({ manual:[{ ...manual,activeCalories:900 }] }).displayedCalories).toBe(600));
  it("retains unlinked manual entries without assuming they are untracked",() => expect(summary({ manual:[manual] }).excludedManual[0].reason).toBe("overlap_unknown"));
  it("adds only confirmed untracked active estimates",() => expect(summary({ manual:[{ ...manual,untracked:true,activeCalories:150 }] }).displayedCalories).toBe(750));
  it("matches an explicitly linked workout once",() => expect(summary({ manual:[{ ...manual,untracked:true,matchedWorkoutId:workout.externalId }] })).toMatchObject({ displayedCalories:600,workoutCount:1 }));
  it("keeps a corrected lower provider observation",() => expect(summary({ snapshot:{ ...snapshot,activeCalories:540 } }).displayedCalories).toBe(540));
  it("treats observed zero as valid",() => expect(summary({ snapshot:{ ...snapshot,activeCalories:0 } })).toMatchObject({ displayedCalories:0,coverage:"provider_daily" }));
  it("does not infer energy from steps",() => expect(summary({ snapshot:{ ...snapshot,activeCalories:null,energyState:"unavailable" },workouts:[] })).toMatchObject({ displayedCalories:null,steps:8000 }));
  it("labels stale energy rather than replacing it with zero",() => expect(summary({ snapshot:{ ...snapshot,energyState:"unavailable" } })).toMatchObject({ displayedCalories:600,coverage:"stale_provider_daily" }));
  it("uses a linked workout once when daily energy is unavailable",() => expect(summary({ snapshot:null,manual:[{ ...manual,matchedWorkoutId:workout.externalId }] })).toMatchObject({ displayedCalories:350,coverage:"workouts_only",workoutCount:1 }));
  it("deduplicates repeated source workout identities",() => expect(summary({ workouts:[workout,workout] }).workoutCount).toBe(1));
  it("preserves distinct overlapping workouts",() => expect(summary({ workouts:[workout,{ ...workout,externalId:"other" }] }).workoutCount).toBe(2));
  it("does not add an estimate of unknown energy basis",() => expect(summary({ manual:[{ ...manual,untracked:true,activeCalories:null }] }).displayedCalories).toBe(600));
  it("retains labelled legacy estimates in manual-only mode",() => expect(summary({ snapshot:null,workouts:[],manual:[{ ...manual,activeCalories:null }] })).toMatchObject({ displayedCalories:350,energyBasis:"mixed_estimate" }));
  it("allows only proven post-disconnect manual additions",() => expect(summary({ disconnectedAt:"2026-10-04T07:00:00Z",manual:[manual,{ ...manual,id:"later",occurredAt:"2026-10-04T08:00:00Z",startedAt:"2026-10-04T07:30:00Z" }] }).displayedCalories).toBe(900));
  it("does not mistake a late manual log for activity after disconnect",() => expect(summary({ disconnectedAt:"2026-10-04T07:00:00Z",manual:[{ ...manual,occurredAt:"2026-10-04T08:00:00Z" }] }).displayedCalories).toBe(600));
  it("conservatively excludes uncertain manual overlap in workout-only mode",() => expect(summary({ snapshot:null,manual:[manual] })).toMatchObject({ displayedCalories:350,workoutCount:1,coverage:"workouts_only" }));
  it("exposes confirmed adjustments so they can be removed",() => expect(summary({ manual:[{ ...manual,untracked:true }] }).manualAdjustments).toEqual([{ id:manual.id,label:manual.label,activeCalories:300 }]));
  it("handles no records without fabricating observations",() => expect(summary({ snapshot:null,workouts:[] })).toMatchObject({ displayedCalories:null,coverage:"unavailable" }));
});
describe("energy and calendar utilities",() => {
  it("estimates net rather than gross MET energy",() => expect(estimatedNetActiveCalories(5,80,60)).toBe(336));
  it("does not create negative active energy for low MET",() => expect(estimatedNetActiveCalories(0.8,80,60)).toBe(0));
  it("rejects invalid estimate inputs",() => { expect(estimatedNetActiveCalories(5,0,60)).toBeNull(); expect(estimatedNetActiveCalories(NaN,80,60)).toBeNull(); });
  it("uses Singapore calendar dates rather than UTC midnight",() => expect(healthDateKey("2026-10-03T17:00:00Z","Asia/Singapore")).toBe("2026-10-04"));
  it("validates real IANA zones",() => { expect(validHealthTimezone("Asia/Singapore")).toBe(true); expect(validHealthTimezone("arbitrary")).toBe(false); });
});
describe("import validation",() => {
  const base = () => ({ schemaVersion:2,requestId:"00000000-0000-4000-8000-000000000001",installationId:"00000000-0000-4000-8000-000000000002",connectionGeneration:"00000000-0000-4000-8000-000000000003",calendarGeneration:"00000000-0000-4000-8000-000000000004",sequence:1,snapshots:[],workouts:[],deletedWorkoutIds:[] });
  it("accepts an empty non-fabricated observation packet",() => expect(healthActivityImportSchema.safeParse(base()).success).toBe(true));
  it("rejects NaN and negative values",() => expect(healthActivityImportSchema.safeParse({ ...base(),workouts:[{ ...workout,startAt:new Date().toISOString(),endAt:new Date().toISOString(),activeCalories:-1 }] }).success).toBe(false));
  it("rejects too many combined records",() => expect(healthActivityImportSchema.safeParse({ ...base(),deletedWorkoutIds:Array.from({ length:201 },(_,i) => String(i)) }).success).toBe(false));
  it("rejects a fictional date and timezone",() => expect(healthActivityImportSchema.safeParse({ ...base(),snapshots:[{ ...snapshot,day:"2026-02-30",timezone:"fiction" }] }).success).toBe(false));
  it("rejects incomplete observed states",() => expect(healthActivityImportSchema.safeParse({ ...base(),snapshots:[{ ...snapshot,activeCalories:null }] }).success).toBe(false));
  it("rejects a partial 23-hour window in a non-DST timezone",() => expect(healthActivityImportSchema.safeParse({ ...base(),snapshots:[{ ...snapshot,windowStart:"2026-10-03T17:00:00Z" }] }).success).toBe(false));
  it("accepts an original offline observation without altering its payload",() => expect(healthActivityImportSchema.safeParse({ ...base(),snapshots:[{ ...snapshot,day:"2026-08-01",windowStart:"2026-07-31T16:00:00Z",windowEnd:"2026-08-01T16:00:00Z",observedAt:"2026-08-01T08:00:00Z" }] }).success).toBe(true));
  it("accepts a real 23-hour spring DST day",() => expect(healthActivityImportSchema.safeParse({ ...base(),snapshots:[{ ...snapshot,day:"2026-03-08",timezone:"America/New_York",windowStart:"2026-03-08T05:00:00Z",windowEnd:"2026-03-09T04:00:00Z",observedAt:"2026-03-09T03:00:00Z" }] }).success).toBe(true));
  it("accepts a real 25-hour autumn DST day",() => expect(healthActivityImportSchema.safeParse({ ...base(),snapshots:[{ ...snapshot,day:"2025-11-02",timezone:"America/New_York",windowStart:"2025-11-02T04:00:00Z",windowEnd:"2025-11-03T05:00:00Z",observedAt:"2025-11-03T03:00:00Z" }] }).success).toBe(true));
});
