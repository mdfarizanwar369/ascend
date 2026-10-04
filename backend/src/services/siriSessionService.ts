import { createHash, randomBytes } from "crypto";
import { pool, query } from "../db/pool";
import { isPlatformOwnerEmail } from "./platformOwnerService";

const SESSION_DAYS = 30;
const tokenPattern = /^ascs_[A-Za-z0-9_-]{43}$/;

export function hashSiriSessionToken(token: string) {
  if (!tokenPattern.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

export async function issueSiriSession(userId: string) {
  const token = `ascs_${randomBytes(32).toString("base64url")}`;
  const hash = hashSiriSessionToken(token)!;
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("update siri_owner_sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [userId]);
    await client.query(
      "insert into siri_owner_sessions (user_id, token_hash, expires_at) values ($1, $2, $3)",
      [userId, hash, expiresAt]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function findSiriSessionUser(token: string) {
  const hash = hashSiriSessionToken(token);
  if (!hash) return null;
  const result = await query<{ user_id: string; email: string }>(
    `select s.user_id, u.email from siri_owner_sessions s
     join users u on u.id = s.user_id
     where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and u.status = 'active'`,
    [hash]
  );
  const user = result.rows[0];
  return user && isPlatformOwnerEmail(user.email) ? user.user_id : null;
}

export async function revokeSiriSession(token: string) {
  const hash = hashSiriSessionToken(token);
  if (!hash) return;
  await query("update siri_owner_sessions set revoked_at = now() where token_hash = $1 and revoked_at is null", [hash]);
}
