/** Operator-only, single test device check. No database, cron, enrollment or retry. */
import { readFileSync } from "node:fs";
import { createPrivateKey, createPublicKey, randomBytes, sign, verify } from "node:crypto";
import { parseArgs } from "node:util";
import { z } from "zod";

const configuration = z.object({
  teamId: z.literal("76N75VT6A7"),
  bundleId: z.literal("fit.getascend.app"),
  keyId: z.string().regex(/^[A-Z0-9]{10}$/),
  environment: z.enum(["sandbox", "production"]),
  privateKeyFile: z.string().min(1)
}).strict();

async function main() {
  const { values } = parseArgs({ options: {
    config: { type: "string" }, send: { type: "boolean", default: false },
    "token-file": { type: "string" }, "event-id": { type: "string" },
    help: { type: "boolean", default: false }
  }, strict: true });
  if (values.help) {
    console.log("Local key check (no network): npx tsx backend/scripts/apns-device-check.ts --config <protected-config.json>");
    console.log("One test alert: add --send --token-file <protected-token.txt> --event-id <test-event-uuid>");
    console.log("Use only a consenting test device. Its signed APNs environment must match the config. For tap testing, use an account-owned event from the same isolated test backend as the app. No retries are performed.");
    return;
  }
  if (!values.config) throw new Error("Pass --config with the protected APNs configuration file.");
  if (!values.send && (values["token-file"] || values["event-id"])) throw new Error("Token and event arguments require --send.");
  const config = configuration.parse(JSON.parse(readFileSync(values.config, "utf8")));
  const pem = readFileSync(config.privateKeyFile, "utf8");
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new Error("APNs requires an ES256 P-256 private key.");
  }
  const challenge = randomBytes(32);
  const signature = sign("sha256", challenge, { key, dsaEncoding: "ieee-p1363" });
  if (!verify("sha256", challenge, { key: createPublicKey(key), dsaEncoding: "ieee-p1363" }, signature)) {
    throw new Error("Private key signing verification failed.");
  }
  console.log(JSON.stringify({ check: "local_key_valid", environment: config.environment, bundleId: config.bundleId,
    appleAuthenticationVerified: false, deviceDeliveryVerified: false }));
  if (!values.send) return;
  if (!values["token-file"] || !values["event-id"]) throw new Error("Sending requires an explicit test token file and event ID.");
  const eventId = z.string().uuid().parse(values["event-id"]);
  const token = readFileSync(values["token-file"], "utf8").trim();
  if (!/^[a-fA-F0-9]{64,200}$/.test(token)) throw new Error("The test token file must contain a raw hexadecimal APNs token.");
  // Import the real adapter after setting its isolated process configuration.
  // The adapter never opens a DB connection; do not load deployment credentials.
  Object.assign(process.env, {
    NODE_ENV: "test", DATABASE_URL: "postgresql://unused@127.0.0.1/apns_no_database",
    ZOE_SMART_NUDGES_ENABLED: "false", ZOE_SMART_NUDGES_SCHEMA: "false", ZOE_SMART_NUDGES_ROLLOUT: "off",
    APNS_ENABLED: "true", APNS_TEAM_ID: config.teamId, APNS_KEY_ID: config.keyId,
    APNS_PRIVATE_KEY: pem, APNS_BUNDLE_ID: config.bundleId, APNS_ENVIRONMENT: config.environment
  });
  const { sendNudgePush } = await import("../src/integrations/nudgePush");
  const result = await sendNudgePush({ id: "explicit-test-device", user_id: "explicit-test-user", fcm_token: token,
    provider: "apns", platform: "ios", apns_environment: config.environment, token_version: 1 }, {
    eventId, title: "Ascend notification test", body: "Your test reminder is here. Tap to open Ascend.",
    expiresAt: new Date(Date.now() + 60_000)
  });
  console.log(JSON.stringify({ check: "provider_result", ...result, deviceDeliveryVerified: false,
    next: result.status === "accepted" ? "Confirm display and tap on the iPhone." : "Inspect the result; do not automatically resend unknown outcomes." }));
  if (result.status !== "accepted") process.exitCode = 1;
}

main().catch(error => {
  // Never log parsed config, tokens, PEM, provider payloads or arbitrary errors.
  console.error(error instanceof z.ZodError ? "Invalid APNs configuration or event ID." : "APNs device check failed. Check file paths, key format and required arguments; no credentials were printed.");
  process.exitCode = 1;
});
