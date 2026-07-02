import crypto from "crypto";
import { query } from "../db/pool";
import { env } from "../config/env";

const GMAIL_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly"
];

type GmailTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type GmailProfile = {
  emailAddress: string;
  historyId?: string;
};

type GmailMessageResponse = {
  id: string;
  threadId: string;
};

type GmailThread = {
  id: string;
  messages?: Array<{
    id: string;
    threadId: string;
    internalDate?: string;
    payload?: {
      headers?: Array<{ name: string; value: string }>;
      body?: { data?: string };
      parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: Array<{ mimeType?: string; body?: { data?: string } }> }>;
    };
    snippet?: string;
  }>;
};

function configured() {
  return Boolean(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REDIRECT_URI && env.GMAIL_TOKEN_ENCRYPTION_KEY);
}

function encryptionKey() {
  const secret = env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("Gmail token encryption is not configured.");
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptToken(payload: string) {
  const [ivRaw, tagRaw, encryptedRaw] = payload.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Stored Gmail token is invalid.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
}

async function postToken(params: Record<string, string>) {
  const response = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params)
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gmail OAuth failed with ${response.status}${body ? `: ${body.slice(0, 180)}` : ""}`);
  }
  return response.json() as Promise<GmailTokenResponse>;
}

async function gmailFetch<T>(path: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(`${GMAIL_API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gmail API failed with ${response.status}${body ? `: ${body.slice(0, 180)}` : ""}`);
  }
  return response.json() as Promise<T>;
}

export async function createFounderGmailAuthUrl(userId: string) {
  if (!configured()) {
    throw new Error("Gmail OAuth is not configured. Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI, and GMAIL_TOKEN_ENCRYPTION_KEY.");
  }
  const state = crypto.randomBytes(32).toString("base64url");
  await query("delete from founder_gmail_oauth_states where user_id = $1 or expires_at < now()", [userId]);
  await query("insert into founder_gmail_oauth_states (state, user_id, expires_at) values ($1, $2, now() + interval '15 minutes')", [state, userId]);
  const params = new URLSearchParams({
    client_id: env.GMAIL_CLIENT_ID!,
    redirect_uri: env.GMAIL_REDIRECT_URI!,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state
  });
  return `${GMAIL_AUTH_URL}?${params.toString()}`;
}

export async function completeFounderGmailOAuth(code: string, state: string) {
  if (!configured()) throw new Error("Gmail OAuth is not configured.");
  const stateResult = await query<{ user_id: string }>(
    "delete from founder_gmail_oauth_states where state = $1 and expires_at > now() returning user_id",
    [state]
  );
  const userId = stateResult.rows[0]?.user_id;
  if (!userId) throw new Error("Gmail OAuth state is invalid or expired.");

  const token = await postToken({
    client_id: env.GMAIL_CLIENT_ID!,
    client_secret: env.GMAIL_CLIENT_SECRET!,
    redirect_uri: env.GMAIL_REDIRECT_URI!,
    grant_type: "authorization_code",
    code
  });
  if (!token.refresh_token) throw new Error("Google did not return a refresh token. Reconnect Gmail and approve offline access.");

  const profile = await gmailFetch<GmailProfile>("/users/me/profile", token.access_token);
  await query(
    `
    insert into founder_gmail_connections (user_id, gmail_email, encrypted_refresh_token, access_token_expires_at, history_id, connected_at, updated_at)
    values ($1, $2, $3, now() + ($4::int * interval '1 second'), $5, now(), now())
    on conflict (user_id)
    do update set
      gmail_email = excluded.gmail_email,
      encrypted_refresh_token = excluded.encrypted_refresh_token,
      access_token_expires_at = excluded.access_token_expires_at,
      history_id = excluded.history_id,
      updated_at = now()
    `,
    [userId, profile.emailAddress, encryptToken(token.refresh_token), token.expires_in ?? 3600, profile.historyId ?? null]
  );
  return { userId, gmailEmail: profile.emailAddress };
}

export async function getFounderGmailConnection(userId: string) {
  const result = await query<{
    gmail_email: string | null;
    last_synced_at: string | null;
    connected_at: string;
  }>("select gmail_email, last_synced_at, connected_at from founder_gmail_connections where user_id = $1", [userId]);
  return result.rows[0] ?? null;
}

async function getAccessToken(userId: string) {
  if (!configured()) throw new Error("Gmail OAuth is not configured.");
  const result = await query<{ encrypted_refresh_token: string }>("select encrypted_refresh_token from founder_gmail_connections where user_id = $1", [userId]);
  const encrypted = result.rows[0]?.encrypted_refresh_token;
  if (!encrypted) throw new Error("Gmail is not connected.");
  const refreshToken = decryptToken(encrypted);
  const token = await postToken({
    client_id: env.GMAIL_CLIENT_ID!,
    client_secret: env.GMAIL_CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  return token.access_token;
}

function base64Url(input: string) {
  return Buffer.from(input, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export async function sendFounderGmail(input: { userId: string; to: string; subject: string; body: string }) {
  const accessToken = await getAccessToken(input.userId);
  const raw = [
    `To: ${sanitizeHeader(input.to)}`,
    `Subject: ${sanitizeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.body
  ].join("\r\n");
  return gmailFetch<GmailMessageResponse>("/users/me/messages/send", accessToken, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ raw: base64Url(raw) })
  });
}

function headerValue(message: NonNullable<GmailThread["messages"]>[number], name: string) {
  return message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBody(data?: string): string {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function messageText(message: NonNullable<GmailThread["messages"]>[number]) {
  const direct = decodeBody(message.payload?.body?.data);
  if (direct) return direct;
  const stack = [...(message.payload?.parts ?? [])];
  while (stack.length) {
    const part = stack.shift();
    if (!part) continue;
    if (part.parts?.length) stack.push(...part.parts);
    if (part.mimeType === "text/plain") {
      const decoded = decodeBody(part.body?.data);
      if (decoded) return decoded;
    }
  }
  return message.snippet ?? "";
}

export async function syncFounderGmailReplies(userId: string) {
  const connection = await getFounderGmailConnection(userId);
  if (!connection?.gmail_email) throw new Error("Gmail is not connected.");
  const accessToken = await getAccessToken(userId);
  const sentResult = await query<{
    lead_id: string;
    gmail_thread_id: string;
    sent_at: string | null;
  }>(
    `
    select lead_id, gmail_thread_id, sent_at
    from founder_lead_conversations
    where channel = 'gmail'
      and direction = 'outbound'
      and gmail_thread_id is not null
    order by created_at desc
    limit 250
    `
  );

  let importedReplies = 0;
  for (const sent of sentResult.rows) {
    const thread = await gmailFetch<GmailThread>(`/users/me/threads/${encodeURIComponent(sent.gmail_thread_id)}?format=full`, accessToken);
    const sentAt = sent.sent_at ? new Date(sent.sent_at).getTime() : 0;
    for (const message of thread.messages ?? []) {
      const messageTime = message.internalDate ? Number(message.internalDate) : 0;
      const from = headerValue(message, "From");
      if (!message.id || messageTime <= sentAt || from.toLowerCase().includes(connection.gmail_email.toLowerCase())) continue;
      const subject = headerValue(message, "Subject");
      const body = messageText(message).slice(0, 12000);
      const insert = await query(
        `
        insert into founder_lead_conversations (
          lead_id, channel, direction, subject, body, external_message_id, gmail_message_id, gmail_thread_id, received_at
        )
        values ($1, 'gmail', 'inbound', $2, $3, $4, $4, $5, to_timestamp($6 / 1000.0))
        on conflict (gmail_message_id) do nothing
        returning id
        `,
        [sent.lead_id, subject || "Gmail reply", body || "(No plain text body)", message.id, thread.id, messageTime]
      );
      if (insert.rowCount) {
        importedReplies += 1;
        await query(
          "update founder_leads set status = 'Replied', updated_at = now() where id = $1 and status in ('Not Contacted','Email Sent')",
          [sent.lead_id]
        );
      }
    }
  }
  await query("update founder_gmail_connections set last_synced_at = now(), updated_at = now() where user_id = $1", [userId]);
  return { importedReplies };
}

export async function disconnectFounderGmail(userId: string) {
  await query("delete from founder_gmail_connections where user_id = $1", [userId]);
}

export function founderGmailConfigured() {
  return configured();
}
