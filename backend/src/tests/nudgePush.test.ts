import { EventEmitter } from "node:events";
import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ connect: vi.fn(), fcm: vi.fn() }));
vi.mock("node:http2", () => ({ connect: mocks.connect }));
vi.mock("../integrations/firebase", () => ({ getFirebaseMessaging: () => ({ send: mocks.fcm }) }));
import { env } from "../config/env";
import { sendNudgePush } from "../integrations/nudgePush";
const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const device = { id: "fixture", user_id: "fixture", fcm_token: "a".repeat(64), provider: "apns", platform: "ios", apns_environment: "sandbox", token_version: 1 };
const payload = { eventId: "11111111-1111-4111-8111-111111111111", title: "Ascend reminder", body: "Open Ascend when you are ready.", expiresAt: new Date(Date.now()+3600000) };
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); env.APNS_ENABLED=false; });
function configure() { env.APNS_ENABLED=true; env.APNS_TEAM_ID="LOCALTEAM"; env.APNS_KEY_ID="LOCALKEY"; env.APNS_ENVIRONMENT="sandbox";
  env.APNS_PRIVATE_KEY=keys.privateKey.export({ type:"pkcs8",format:"pem" }).toString(); }
it("builds a signed, expiring APNs alert with an opaque resolver link and no health payload", async () => {
  configure(); const client=new EventEmitter() as EventEmitter & {request:ReturnType<typeof vi.fn>;destroy:ReturnType<typeof vi.fn>};
  const request=new EventEmitter() as EventEmitter & {end:ReturnType<typeof vi.fn>}; client.destroy=vi.fn();
  request.end=vi.fn(()=>queueMicrotask(()=>{request.emit("response",{":status":200});request.emit("end");})); client.request=vi.fn(()=>request); mocks.connect.mockReturnValue(client);
  expect(await sendNudgePush(device,payload)).toEqual({status:"accepted",code:"apns_accepted"});
  expect(mocks.connect).toHaveBeenCalledWith("https://api.sandbox.push.apple.com");
  const headers=client.request.mock.calls[0][0]; expect(headers["apns-push-type"]).toBe("alert"); expect(headers["apns-id"]).toBe(payload.eventId);
  const jwt=headers.authorization.slice(7).split(".");
  expect(verify("sha256",Buffer.from(`${jwt[0]}.${jwt[1]}`),{key:keys.publicKey,dsaEncoding:"ieee-p1363"},Buffer.from(jwt[2],"base64url"))).toBe(true);
  expect(JSON.parse(request.end.mock.calls[0][0])).toEqual({aps:{alert:{title:payload.title,body:payload.body},sound:"default"},href:`/notifications/open?id=${payload.eventId}`});
});
it("ends an ambiguous APNs timeout without a duplicate request", async () => {
  configure(); vi.useFakeTimers(); const request=new EventEmitter() as EventEmitter & {end:ReturnType<typeof vi.fn>}; request.end=vi.fn();
  const client=new EventEmitter() as EventEmitter & {request:ReturnType<typeof vi.fn>;destroy:ReturnType<typeof vi.fn>}; client.request=vi.fn(()=>request);client.destroy=vi.fn();mocks.connect.mockReturnValue(client);
  const pending=sendNudgePush(device,payload); await vi.advanceTimersByTimeAsync(10001);
  expect(await pending).toEqual({status:"unknown",code:"provider_timeout"});expect(client.request).toHaveBeenCalledOnce();expect(client.destroy).toHaveBeenCalledOnce();
});
it("does not contact APNs when disabled or the environment does not match",async()=>{
  env.APNS_ENABLED=false; expect((await sendNudgePush(device,payload)).status).toBe("failed"); expect(mocks.connect).not.toHaveBeenCalled();
  configure(); expect((await sendNudgePush({...device,apns_environment:"production"},payload)).status).toBe("failed");expect(mocks.connect).not.toHaveBeenCalled();
});
it("uses existing FCM for alert delivery and leaves acceptance distinct from display",async()=>{
  mocks.fcm.mockResolvedValue("provider-message-id");
  expect(await sendNudgePush({...device,provider:"fcm",platform:"android"},payload)).toEqual({status:"accepted",code:"fcm_accepted"});
  expect(mocks.fcm).toHaveBeenCalledWith(expect.objectContaining({notification:{title:payload.title,body:payload.body},data:{href:`/notifications/open?id=${payload.eventId}`,eventId:payload.eventId},android:expect.objectContaining({notification:{channelId:"coach_checkins",tag:payload.eventId}})}));
});
