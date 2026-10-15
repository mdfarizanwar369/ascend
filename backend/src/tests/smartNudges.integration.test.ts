import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { defaultNudgePreferences, NudgeCategory } from "@ascend/shared";
const testUrl = process.env.ASCEND_HARDENING_TEST_DATABASE_URL;
let db: typeof import("../db/pool"); let nudges: typeof import("../services/smartNudgeService"); let config: typeof import("../config/env");
const users: string[] = [];
const start = new Date("2030-01-06T10:00:00Z"); const due = new Date("2030-01-06T12:00:00Z");
const accepted = vi.fn(async () => ({ status: "accepted" as const, code: "stub_accepted" }));
async function user(categories: NudgeCategory[] = ["lunch"], devices = 1) {
  const id = randomUUID(); users.push(id);
  await db.query("insert into users(id,firebase_uid,email,full_name) values($1,$2,$3,'Nudge test')", [id, `nudge-${id}`, `${id}@example.invalid`]);
  const prefs = defaultNudgePreferences(); prefs.enabled = true; prefs.intensity = "supportive";
  for (const category of categories) prefs.categories[category] = { enabled: true, time: "12:00" };
  await nudges.saveNudgePreferences(id, prefs, 0, start);
  for (let i=0; i<devices; i++) await db.query("insert into notification_devices(user_id,fcm_token,platform,last_seen_at) values($1,$2,'android',$3)", [id, `fake-nudge-token-${randomUUID()}`, start]);
  await nudges.planSmartNudges(100, start);
  return id;
}
async function events(id: string) { return (await db.query("select * from notification_events where user_id=$1 and scheduled_for between $2 and $2::timestamptz+interval '12 hours' order by priority,id", [id, start])).rows; }
async function run(now = due, send = accepted) { return nudges.runSmartNudges({ now: () => now, send, plan: false }); }
const dailyAt = (time: string) => new Date(`2030-01-06T${time}:00Z`);
async function dailySetup(withWorkout = true) {
  const id = await user([]); const saved = await nudges.getNudgePreferences(id);
  saved.preferences.intensity = "balanced";
  for (const c of ["breakfast","lunch","dinner","hydration","workout"] as const) saved.preferences.categories[c].enabled = true;
  await nudges.saveNudgePreferences(id,saved.preferences,saved.version,dailyAt("07:00"));
  const session = withWorkout ? await nudges.saveWorkoutSchedule(id,{title:"Fixture workout",startsAt:dailyAt("17:30").toISOString(),leadMinutes:30,status:"planned"},dailyAt("07:00")) : null;
  await nudges.planSmartNudges(100,dailyAt("07:00"));
  return {id,session};
}
async function dailyEvents(id: string) {
  return (await db.query("select nudge_category,status,error from notification_events where user_id=$1 and scheduled_for >= $2 and scheduled_for < $2::timestamptz+interval '1 day' order by scheduled_for",[id,dailyAt("00:00")])).rows;
}
describe.skipIf(!testUrl)("Smart Nudges with isolated PostgreSQL and stubbed providers", () => {
  beforeAll(async () => {
    const url = new URL(testUrl!); if (url.hostname !== "127.0.0.1" || url.pathname !== "/ascend_hardening_test") throw new Error("Isolated local test database required");
    vi.stubEnv("DATABASE_URL", testUrl!); vi.stubEnv("AI_PROVIDER", "local"); vi.stubEnv("ZOE_SMART_NUDGES_SCHEMA", "true");
    vi.stubEnv("ZOE_SMART_NUDGES_ENABLED", "true"); vi.stubEnv("ZOE_SMART_NUDGES_ROLLOUT", "all");
    db = await import("../db/pool"); nudges = await import("../services/smartNudgeService"); config = await import("../config/env");
  });
  afterEach(async () => {
    config.env.ZOE_SMART_NUDGES_ENABLED = true; config.env.ZOE_SMART_NUDGES_ROLLOUT = "all";
    if (users.length) await db.query("delete from users where id=any($1::uuid[])", [users.splice(0)]);
    accepted.mockClear();
  });
  afterAll(async () => { if (db) await db.pool.end(); vi.unstubAllEnvs(); });
  it("sends three meals plus water on a rest day, with concurrent workers still sending only four", async () => {
    const {id} = await dailySetup(false);
    for (const time of ["08:00","12:30","15:00","19:00"]) await Promise.all([run(dailyAt(time)),run(dailyAt(time))]);
    expect(accepted).toHaveBeenCalledTimes(4);
    expect((await dailyEvents(id)).filter(e=>e.status==="accepted").map(e=>e.nudge_category)).toEqual(["breakfast","lunch","hydration","dinner"]);
  });
  it("reserves room for a later workout and dinner instead of using the fourth slot on water", async () => {
    const {id} = await dailySetup();
    for (const time of ["08:00","12:30","15:00","17:00","19:00"]) await run(dailyAt(time));
    expect(accepted).toHaveBeenCalledTimes(4);
    const rows = await dailyEvents(id);
    expect(rows.filter(e=>e.status==="accepted").map(e=>e.nudge_category)).toEqual(["breakfast","lunch","workout","dinner"]);
    expect(rows.find(e=>e.nudge_category==="hydration")).toMatchObject({status:"suppressed",error:"priority_reserved"});
  });
  it("protects an appointment saved before the planner has queued its reminder", async () => {
    const {id} = await dailySetup(false);
    await run(dailyAt("08:00")); await run(dailyAt("12:30"));
    await nudges.saveWorkoutSchedule(id,{title:"Later today",startsAt:dailyAt("17:30").toISOString(),leadMinutes:30,status:"planned"},dailyAt("14:00"));
    await run(dailyAt("15:00"));
    expect((await dailyEvents(id)).find(e=>e.nudge_category==="hydration")?.error).toBe("priority_reserved");
    await nudges.planSmartNudges(100,dailyAt("15:00"));
    await run(dailyAt("17:00")); await run(dailyAt("19:00"));
    expect(accepted).toHaveBeenCalledTimes(4);
  });
  it.each(["cancelled","completed"] as const)("releases water capacity after a workout is %s", async status => {
    const {id,session} = await dailySetup();
    await run(dailyAt("08:00")); await run(dailyAt("12:30"));
    await nudges.saveWorkoutSchedule(id,{id:session!.id,version:1,title:"Fixture workout",startsAt:dailyAt("17:30").toISOString(),leadMinutes:30,status},dailyAt("14:00"));
    await run(dailyAt("15:00")); await run(dailyAt("17:00")); await run(dailyAt("19:00"));
    expect((await dailyEvents(id)).find(e=>e.nudge_category==="hydration")?.status).toBe("accepted");
    expect(accepted).toHaveBeenCalledTimes(4);
  });
  it("keeps tomorrow's meals protected by the rolling cap even if one meal was logged today", async () => {
    const {id} = await dailySetup();
    await run(dailyAt("08:00"));
    await db.query("insert into food_logs(user_id,estimated_food_name,meal_type,calories,protein_g,carbs_g,fat_g,logged_at) values($1,'Fixture','lunch',0,0,0,0,$2)",[id,dailyAt("12:00")]);
    for (const time of ["12:30","15:00","17:00","19:00"]) await run(dailyAt(time));
    expect((await dailyEvents(id)).filter(e=>e.status==="accepted").map(e=>e.nudge_category)).toEqual(["breakfast","workout","dinner"]);
    expect((await dailyEvents(id)).find(e=>e.nudge_category==="lunch")?.error).toBe("action_completed");
    expect((await dailyEvents(id)).find(e=>e.nudge_category==="hydration")?.error).toBe("priority_reserved");
    expect(accepted).toHaveBeenCalledTimes(3);
  });
  it("allows water when the nearby meal requiring cooldown space has already been logged", async () => {
    const id = await user(["hydration","lunch"]);
    const p = await nudges.getNudgePreferences(id); p.preferences.categories.lunch.time="12:30";
    await nudges.saveNudgePreferences(id,p.preferences,p.version,start); await nudges.planSmartNudges(100,start);
    await db.query("insert into food_logs(user_id,estimated_food_name,meal_type,calories,protein_g,carbs_g,fat_g,logged_at) values($1,'Fixture','lunch',0,0,0,0,$2)",[id,dailyAt("11:30")]);
    await run(); await run(dailyAt("12:30"));
    expect((await dailyEvents(id)).find(e=>e.nudge_category==="hydration" && e.status==="accepted")).toBeDefined();
    expect(accepted).toHaveBeenCalledOnce();
  });
  it("protects a nearby meal even when water has a legacy equal queue priority", async () => {
    const id = await user(["hydration","lunch"]);
    const p = await nudges.getNudgePreferences(id); p.preferences.categories.lunch.time="12:30";
    await nudges.saveNudgePreferences(id,p.preferences,p.version,start); await nudges.planSmartNudges(100,start);
    await db.query("update notification_events set priority=2 where user_id=$1 and nudge_category='hydration'",[id]);
    await run(); await run(dailyAt("12:30"));
    expect((await events(id)).find(e=>e.nudge_category==="hydration" && e.error==="priority_reserved")).toBeDefined();
    expect(accepted).toHaveBeenCalledOnce();
  });
  it("plans durably once, concurrently dispatches once and persists provider acceptance separately from opens", async () => {
    const id = await user();
    await Promise.all([nudges.planSmartNudges(100, start), nudges.planSmartNudges(100, start)]);
    expect((await events(id)).length).toBe(1);
    await Promise.all(Array.from({ length: 6 }, () => run()));
    expect(accepted).toHaveBeenCalledOnce();
    const [event] = await events(id); expect(event.status).toBe("accepted"); expect(event.opened_at).toBeNull();
    expect(await nudges.resolveNudgeOpen(id, event.id, due)).toEqual({ href: "/food-log?meal=lunch", available: true });
    await nudges.resolveNudgeOpen(id, event.id, due);
    expect((await db.query("select count(*)::int n from notification_transitions where event_id=$1 and state='opened'", [event.id])).rows[0].n).toBe(1);
  });
  it("suppresses the matching local meal including a late backdated log, but not another day/category", async () => {
    const id = await user();
    await db.query("insert into food_logs(user_id,estimated_food_name,meal_type,calories,protein_g,carbs_g,fat_g,logged_at) values($1,'Test meal','breakfast',0,0,0,0,$2),($1,'Test meal','lunch',0,0,0,0,$3)", [id, due, new Date("2030-01-05T12:00Z")]);
    await run(); expect(accepted).toHaveBeenCalledOnce();
    const second = await user();
    await db.query("insert into food_logs(user_id,estimated_food_name,meal_type,calories,protein_g,carbs_g,fat_g,logged_at) values($1,'Test meal','lunch',0,0,0,0,$2)", [second, new Date("2030-01-06T11:00Z")]);
    await run(); expect(accepted).toHaveBeenCalledOnce(); expect((await events(second))[0].error).toBe("action_completed");
  });
  it("uses IANA local date for meals across the UTC boundary", async () => {
    const id = await user(); const settings = await nudges.getNudgePreferences(id);
    settings.preferences.timezone = "Pacific/Auckland"; settings.preferences.categories.lunch.time = "01:00";
    settings.preferences.quietStart = "02:00"; settings.preferences.quietEnd = "03:00";
    await nudges.saveNudgePreferences(id, settings.preferences, settings.version, start);
    await nudges.planSmartNudges(100, start);
    await db.query("insert into food_logs(user_id,estimated_food_name,meal_type,calories,protein_g,carbs_g,fat_g,logged_at) values($1,'Test meal','lunch',0,0,0,0,'2030-01-06T11:30Z')", [id]);
    await run(); expect(accepted).not.toHaveBeenCalled();
    expect((await events(id)).some(e => e.error === "action_completed")).toBe(true);
  });
  it("master off invalidates queued jobs and optimistic versions prevent a stale multi-device opt-in", async () => {
    const id = await user(); const saved = await nudges.getNudgePreferences(id);
    await nudges.saveNudgePreferences(id, { ...saved.preferences, enabled: false }, saved.version, start);
    await expect(nudges.saveNudgePreferences(id, saved.preferences, saved.version, start)).rejects.toMatchObject({ status: 409 });
    await run(); expect(accepted).not.toHaveBeenCalled(); expect((await events(id))[0].status).toBe("suppressed");
  });
  it("global off also stops already queued work", async () => {
    const id = await user(); config.env.ZOE_SMART_NUDGES_ENABLED = false;
    await run(); expect(accepted).not.toHaveBeenCalled(); expect((await events(id))[0].error).toBe("rollout_off");
  });
  it("requires an allowlisted internal/pilot account", async () => {
    const id = await user(); config.env.ZOE_SMART_NUDGES_ROLLOUT = "pilot";
    await run(); expect(accepted).not.toHaveBeenCalled(); expect((await events(id))[0].error).toBe("rollout_off");
  });
  it("skips stale jobs after an outage and honours quiet-hour changes", async () => {
    const id = await user(); await run(new Date("2030-01-06T14:00Z")); expect((await events(id))[0].error).toBe("expired");
    const second = await user(); const p = await nudges.getNudgePreferences(second);
    p.preferences.quietStart = "11:00"; p.preferences.quietEnd = "14:00";
    await nudges.saveNudgePreferences(second, p.preferences, p.version, start); await nudges.planSmartNudges(100, start);
    await run(); expect(accepted).not.toHaveBeenCalled(); expect((await events(second)).some(e => e.error === "quiet_hours")).toBe(true);
  });
  it("has a functioning reschedule/cancel/done schedule and suppresses changed appointments", async () => {
    const id = await user(["workout"]);
    const appointment = await nudges.saveWorkoutSchedule(id, { title: "Test session", startsAt: "2030-01-06T12:30:00Z", leadMinutes: 30, status: "planned" }, start);
    await nudges.planSmartNudges(100, start);
    expect((await events(id)).find(e=>e.nudge_category==="workout")?.expires_at.toISOString()).toBe("2030-01-06T12:45:00.000Z");
    await nudges.saveWorkoutSchedule(id, { id: appointment.id, version: 1, title: "Test session", startsAt: "2030-01-06T13:30:00Z", leadMinutes: 30, status: "planned" }, start);
    await nudges.planSmartNudges(100, start); await run(); expect(accepted).not.toHaveBeenCalled();
    await nudges.saveWorkoutSchedule(id, { id: appointment.id, version: 2, title: "Test session", startsAt: "2030-01-06T13:30:00Z", leadMinutes: 30, status: "completed" }, start);
    await run(new Date("2030-01-06T13:00Z")); expect(accepted).not.toHaveBeenCalled();
  });
  it("links only owned workout logs and does not mistake an unrelated log for appointment completion", async () => {
    const id = await user(["workout"]); const other = await user([]);
    const session = await nudges.saveWorkoutSchedule(id, { title: "Test", startsAt: "2030-01-06T12:30:00Z", leadMinutes: 30, status: "planned" }, start);
    await nudges.planSmartNudges(100, start);
    const own = (await db.query("insert into analytics_events(user_id,event_name,metadata) values($1,'burn_log','{}') returning id", [id])).rows[0].id;
    const foreign = (await db.query("insert into analytics_events(user_id,event_name,metadata) values($1,'burn_log','{}') returning id", [other])).rows[0].id;
    expect(await nudges.completeScheduledWorkout(id, session.id, foreign)).toBe(false);
    expect(await nudges.completeScheduledWorkout(other, session.id, own)).toBe(false);
    expect(await nudges.completeScheduledWorkout(id, session.id, own)).toBe(true);
    await run(); expect((await events(id))[0].error).toBe("action_completed"); expect(accepted).not.toHaveBeenCalled();
  });
  it("prioritises workouts over overlapping meal and routine reminders under concurrent workers", async () => {
    const id = await user(["workout", "lunch", "evening", "weekly"]);
    await nudges.saveWorkoutSchedule(id, { title: "Test", startsAt: "2030-01-06T12:00:00Z", leadMinutes: 0, status: "planned" }, start);
    await nudges.planSmartNudges(100, start);
    await Promise.all([run(), run(), run()]); await run();
    expect(accepted).toHaveBeenCalledOnce(); expect((await events(id)).find(e => e.status === "accepted")?.nudge_category).toBe("workout");
  });
  it("counts cap reservations even when the provider outcome is unknown", async () => {
    const id = await user();
    for (let i=0;i<4;i++) await db.query(`insert into notification_events(user_id,notification_type,priority,title,body,dedupe_key,nudge_category,dispatch_started_at,status)
      values($1,'zoe_smart_nudge',4,'a','b',$2,'morning',$3,'unknown')`, [id, `prior-${i}`, new Date(due.getTime() - (i + 2) * 3600000)]);
    await run(); expect(accepted).not.toHaveBeenCalled(); expect((await events(id))[0].error).toBe("overall_cap");
  });
  it("retries definite rejection without re-sending to accepted devices", async () => {
    const id = await user(["lunch"], 2); let calls = 0;
    const sender = vi.fn(async () => (++calls === 2 ? { status: "retry", code: "rejected_503" } : { status: "accepted", code: "ok" }) as { status: "retry" | "accepted"; code: string });
    await nudges.runSmartNudges({ now: () => due, send: sender, plan: false });
    expect((await events(id))[0].status).toBe("retry");
    await nudges.runSmartNudges({ now: () => new Date(due.getTime()+3*60000), send: sender, plan: false });
    expect(sender).toHaveBeenCalledTimes(3); expect((await events(id))[0].status).toBe("accepted");
  });
  it("does not retry timeouts or interrupted workers; never logs tokens", async () => {
    const id = await user(); const sender = vi.fn(async () => { throw new Error("secret-token-do-not-record"); });
    await nudges.runSmartNudges({ now: () => due, send: sender, plan: false }); await run();
    expect(sender).toHaveBeenCalledOnce(); expect(accepted).not.toHaveBeenCalled(); expect((await events(id))[0].status).toBe("unknown");
    expect(JSON.stringify((await db.query("select * from notification_transitions where event_id=$1", [(await events(id))[0].id])).rows)).not.toContain("secret-token");
    const second = await user(); const [event] = await events(second);
    await db.query("update notification_events set status='dispatching',next_attempt_at=$2,dispatch_started_at=$2 where id=$1", [event.id, new Date(due.getTime()-3*60000)]);
    await run(); expect((await events(second))[0].status).toBe("unknown"); expect(accepted).not.toHaveBeenCalled();
  });
  it("invalidates uninstalled tokens and suppresses missing, revoked and reassigned devices", async () => {
    const id = await user(); const sender = vi.fn(async () => ({ status: "failed" as const, code: "invalid_token", invalidToken: true }));
    await nudges.runSmartNudges({ now: () => due, send: sender, plan: false });
    expect((await db.query("select enabled from notification_devices where user_id=$1", [id])).rows[0].enabled).toBe(false);
    const missing = await user(["lunch"], 0);
    const revoked = await user(); await db.query("update notification_devices set enabled=false where user_id=$1", [revoked]);
    await run(); expect((await events(revoked))[0].error).toBe("no_device"); expect(accepted).not.toHaveBeenCalled();
    expect((await events(missing))[0].error).toBe("no_device");
  });
  it("rechecks opt-out between device sends and preserves the accepted first-device fact", async () => {
    const id = await user(["lunch"], 2);
    const sender = vi.fn(async () => { const p = await nudges.getNudgePreferences(id); await nudges.saveNudgePreferences(id, { ...p.preferences, enabled: false }, p.version, due); return { status: "accepted" as const, code: "ok" }; });
    await nudges.runSmartNudges({ now: () => due, send: sender, plan: false });
    expect(sender).toHaveBeenCalledOnce(); expect((await events(id))[0].status).toBe("suppressed");
    expect((await db.query("select status from notification_deliveries where event_id=$1", [(await events(id))[0].id])).rows.map(x=>x.status).sort()).toEqual(["accepted","suppressed"]);
  });
  it("isolates opens, stale sessions and deleted accounts", async () => {
    const id = await user(); const other = await user([]); await run(); const [event] = await events(id);
    expect(await nudges.resolveNudgeOpen(other, event.id, due)).toEqual({ href: "/dashboard", available: false });
    expect((await events(id))[0].opened_at).toBeNull();
    expect((await nudges.resolveNudgeOpen(id, event.id, new Date(due.getTime()+8*86400000))).available).toBe(false);
    await db.query("delete from users where id=$1", [id]); await run();
    expect((await db.query("select 1 from notification_deliveries where event_id=$1", [event.id])).rowCount).toBe(0);
  });
  it("rechecks a backdated meal that arrives between two device sends", async () => {
    const id = await user(["lunch"],2);
    const sender = vi.fn(async () => {
      await db.query("insert into food_logs(user_id,estimated_food_name,meal_type,calories,protein_g,carbs_g,fat_g,logged_at) values($1,'Fixture','lunch',0,0,0,0,$2)", [id,new Date(due.getTime()-3600000)]);
      return { status: "accepted" as const, code: "ok" };
    });
    await nudges.runSmartNudges({ now: () => due, send: sender, plan: false });
    expect(sender).toHaveBeenCalledOnce(); expect((await events(id))[0].error).toBe("action_completed");
  });
  it("suppresses hydration after a recent log and opens weekly progress without fabricated data", async () => {
    const id = await user(["hydration"]);
    await db.query("insert into water_logs(user_id,amount_ml,logged_at) values($1,200,$2)",[id,new Date(due.getTime()-60000)]);
    await run(); expect((await events(id))[0].error).toBe("action_completed");
    const weekly = await user(["weekly"]); await run(); const [event] = await events(weekly);
    expect(event.body).not.toMatch(/\d|strongest|best|weight/i);
    expect(await nudges.resolveNudgeOpen(weekly,event.id,due)).toEqual({href:"/journey",available:true});
  });
  it("stops comeback attempts even after event retention, and resumes only after a new app visit", async () => {
    const id = await user(["comeback"]); const anchor = new Date(start.getTime()-120*86400000);
    await db.query(`update notification_preferences set consented_at=$2,last_app_open_at=$2,comeback_anchor=$2,
      comeback_attempts=3,last_comeback_at=$2,next_plan_at=$3 where user_id=$1`,[id,anchor,start]);
    await db.query("delete from notification_events where user_id=$1",[id]);
    await nudges.planSmartNudges(100,start); expect(await events(id)).toHaveLength(0);
    await nudges.recordNudgeAppOpen(id,start);
    const later = new Date(start.getTime()+8*86400000);
    await nudges.planSmartNudges(100,later);
    expect((await db.query("select id from notification_events where user_id=$1",[id])).rowCount).toBeGreaterThan(0);
  });
  it("retries no more than three definite rejections and fences a reassigned device", async () => {
    const id = await user(); const sender = vi.fn(async () => ({status:"retry" as const,code:"rejected_429"}));
    for (const minutes of [0,3,8,20]) await nudges.runSmartNudges({now:()=>new Date(due.getTime()+minutes*60000),send:sender,plan:false});
    expect(sender).toHaveBeenCalledTimes(3); expect((await events(id))[0].status).toBe("failed");
    const second = await user(["lunch"],2); const other = await user([]);
    const reassign = vi.fn(async () => { await db.query("update notification_devices set user_id=$2,token_version=token_version+1 where user_id=$1",[second,other]); return {status:"accepted" as const,code:"ok"}; });
    await nudges.runSmartNudges({now:()=>due,send:reassign,plan:false});
    expect(reassign).toHaveBeenCalledOnce(); expect((await events(second))[0].status).toBe("suppressed");
  });
  it("uses verified milestones, resets comeback episodes on return, and suppresses pending messages", async () => {
    const id = await user(["weekly"]); const trainer = await user([]);
    await db.query("insert into messages(sender_user_id,receiver_user_id,body) values($1,$2,'fixture')", [trainer,id]);
    await run(); expect((await events(id))[0].error).toBe("pending_message");
    const milestoneUser = await user(["milestone"]);
    await db.query("insert into analytics_events(user_id,event_name,metadata,created_at) values($1,'burn_log','{}',$2)", [milestoneUser, new Date(start.getTime()+1000)]);
    await nudges.recordNudgeAppOpen(milestoneUser, new Date(start.getTime()+2000)); await nudges.planSmartNudges(100, new Date(start.getTime()+3000));
    await run(); expect((await events(milestoneUser))[0].status).toBe("accepted");
    expect((await db.query("select milestone from notification_milestones where user_id=$1", [milestoneUser])).rows[0].milestone).toBe(1);
    const absent = await user(["comeback"]);
    await db.query("update notification_preferences set consented_at=$2,last_app_open_at=$2,next_plan_at=$3 where user_id=$1", [absent,new Date(start.getTime()-14*86400000),start]);
    await nudges.planSmartNudges(100,start); await nudges.recordNudgeAppOpen(absent,new Date(start.getTime()+3600000));
    await run(); expect((await events(absent))[0].error).toBe("no_longer_relevant");
  });
});
