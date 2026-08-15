import crypto from "node:crypto";
import { env } from "../config/env";

function encryptionKey() {
  const configured = env.GOOGLE_PLAY_TOKEN_ENCRYPTION_KEY?.trim();
  if (!configured) throw new Error("Google Play token encryption is not configured.");

  const decoded = Buffer.from(configured, "base64");
  if (decoded.length !== 32) {
    throw new Error("Google Play token encryption key must be a base64-encoded 32-byte key.");
  }
  return decoded;
}

export function hashProviderToken(token: string) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function encryptProviderToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: env.GOOGLE_PLAY_TOKEN_KEY_VERSION,
    hash: hashProviderToken(token),
  };
}

export function decryptProviderToken(input: { ciphertext: string; iv: string; authTag: string; keyVersion: number }) {
  if (input.keyVersion !== env.GOOGLE_PLAY_TOKEN_KEY_VERSION) throw new Error("Unsupported provider token key version.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(input.iv, "base64"));
  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function obfuscatedGooglePlayAccountId(userId: string) {
  const secret = env.GOOGLE_PLAY_ACCOUNT_OBFUSCATION_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("Google Play account obfuscation is not configured.");
  return crypto.createHmac("sha256", secret).update(userId, "utf8").digest("hex");
}
