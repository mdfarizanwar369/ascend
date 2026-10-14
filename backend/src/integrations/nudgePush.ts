import { connect } from "node:http2";
import { createPrivateKey, sign } from "node:crypto";
import { getFirebaseMessaging } from "./firebase";
import { env } from "../config/env";

export type NudgePushDevice = { id: string; user_id: string; fcm_token: string; provider: string; platform: string; apns_environment: string | null; token_version: number };
export type NudgePushPayload = { eventId: string; title: string; body: string; expiresAt: Date };
export type NudgePushResult = { status: "accepted" | "retry" | "failed" | "unknown"; code: string; invalidToken?: boolean };
export function apnsReady() { return Boolean(env.APNS_ENABLED && env.APNS_TEAM_ID && env.APNS_KEY_ID && env.APNS_PRIVATE_KEY); }
export function providerReady(device: Pick<NudgePushDevice, "provider" | "apns_environment">) {
  return device.provider === "fcm" || (device.provider === "apns" && apnsReady() && device.apns_environment === env.APNS_ENVIRONMENT);
}
export function classifyFcmError(error: unknown): NudgePushResult {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
  if (["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(code)) return { status: "failed", code, invalidToken: true };
  // Only explicit rejection codes. Internal/network errors may follow acceptance.
  if (["messaging/server-unavailable", "messaging/message-rate-exceeded", "messaging/quota-exceeded", "messaging/device-message-rate-exceeded"].includes(code)) return { status: "retry", code };
  if (["messaging/invalid-argument", "messaging/mismatched-credential", "messaging/authentication-error"].includes(code)) return { status: "failed", code };
  return { status: "unknown", code: "provider_outcome_unknown" };
}
export function classifyApns(status: number, reason: string): NudgePushResult {
  if (status === 200) return { status: "accepted", code: "apns_accepted" };
  if (status === 410 || ["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"].includes(reason)) return { status: "failed", code: "apns_invalid_token", invalidToken: true };
  if ([429, 500, 503].includes(status)) return { status: "retry", code: `apns_rejected_${status}` };
  return { status: "failed", code: `apns_rejected_${status}` };
}
let cachedJwt: { value: string; issued: number } | null = null;
function apnsJwt() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.issued < 3000) return cachedJwt.value;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "ES256", kid: env.APNS_KEY_ID })}.${encode({ iss: env.APNS_TEAM_ID, iat: now })}`;
  const key = createPrivateKey(env.APNS_PRIVATE_KEY!.replace(/\\n/g, "\n"));
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  cachedJwt = { value: `${unsigned}.${signature}`, issued: now }; return cachedJwt.value;
}
async function sendApns(device: NudgePushDevice, payload: NudgePushPayload): Promise<NudgePushResult> {
  if (!providerReady(device)) return { status: "failed", code: "apns_not_configured" };
  let jwt: string;
  try { jwt = apnsJwt(); } catch { return { status: "failed", code: "apns_signing_configuration" }; }
  return new Promise(resolve => {
    let settled = false;
    const client = connect(env.APNS_ENVIRONMENT === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com");
    const finish = (result: NudgePushResult) => { if (settled) return; settled = true; clearTimeout(timer); client.destroy(); resolve(result); };
    const timer = setTimeout(() => finish({ status: "unknown", code: "provider_timeout" }), 10000);
    client.on("error", () => finish({ status: "unknown", code: "provider_connection_unknown" }));
    const request = client.request({ ":method": "POST", ":path": `/3/device/${device.fcm_token}`, authorization: `bearer ${jwt}`,
      "apns-topic": env.APNS_BUNDLE_ID, "apns-push-type": "alert", "apns-priority": "10", "apns-id": payload.eventId,
      "apns-expiration": String(Math.floor(payload.expiresAt.getTime() / 1000)), "apns-collapse-id": payload.eventId });
    let status = 0; let body = "";
    request.on("response", headers => { status = Number(headers[":status"]); });
    request.on("data", chunk => { if (body.length < 2048) body += chunk.toString(); });
    request.on("error", () => finish({ status: "unknown", code: "provider_stream_unknown" }));
    request.on("end", () => {
      let reason = ""; try { reason = JSON.parse(body).reason ?? ""; } catch { /* empty accepted response */ }
      finish(status ? classifyApns(status, reason) : { status: "unknown", code: "provider_empty_response" });
    });
    request.end(JSON.stringify({ aps: { alert: { title: payload.title, body: payload.body }, sound: "default" }, href: `/notifications/open?id=${payload.eventId}` }));
  });
}
export async function sendNudgePush(device: NudgePushDevice, payload: NudgePushPayload): Promise<NudgePushResult> {
  if (device.provider === "apns") return sendApns(device, payload);
  if (device.provider !== "fcm") return { status: "failed", code: "unsupported_provider" };
  const href = `/notifications/open?id=${payload.eventId}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getFirebaseMessaging().send({ token: device.fcm_token, notification: { title: payload.title, body: payload.body },
        data: { href, eventId: payload.eventId }, android: { ttl: Math.max(0, payload.expiresAt.getTime() - Date.now()), collapseKey: payload.eventId,
          notification: { channelId: "coach_checkins", tag: payload.eventId } },
        webpush: { headers: { TTL: String(Math.max(0, Math.floor((payload.expiresAt.getTime() - Date.now()) / 1000))) },
          fcmOptions: { link: new URL(href, env.FRONTEND_URL).href }, notification: { tag: payload.eventId, icon: "/brand/ascend-logo.png" } }
      }).then((): NudgePushResult => ({ status: "accepted", code: "fcm_accepted" })).catch(classifyFcmError),
      new Promise<NudgePushResult>(resolve => { timer = setTimeout(() => resolve({ status: "unknown", code: "provider_timeout" }), 10000); })
    ]);
  } catch (error) { return classifyFcmError(error); } finally { if (timer) clearTimeout(timer); }
}
