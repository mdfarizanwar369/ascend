import { AsyncLocalStorage } from "node:async_hooks";
import { AI_CONSENT_VERSION, AI_PROVIDER_NAMES, AiConsentStatus, AiDataProvider } from "@ascend/shared";
import { env } from "../config/env";
import { query } from "../db/pool";

const aiSubjects = new AsyncLocalStorage<readonly string[]>();

export class AiConsentRequiredError extends Error {
  readonly status = 403;
  constructor() {
    super("AI data sharing is off. Open Profile → AI privacy to review and allow sharing. If you are coaching a client, they must also allow sharing of their data.");
    this.name = "AiConsentRequiredError";
  }
}

export function currentAiProvider(): AiDataProvider | null {
  return env.AI_PROVIDER === "gemini" || env.AI_PROVIDER === "openai" ? env.AI_PROVIDER : null;
}

// The authenticated actor is always included. Client-specific work adds the
// owner of the records; a trainer's permission cannot authorize a client's data.
export function withAiDataSubject<T>(userId: string, work: () => T): T {
  return aiSubjects.run([...new Set([...(aiSubjects.getStore() ?? []), userId])], work);
}

export async function getAiConsent(userId: string): Promise<AiConsentStatus> {
  const provider = currentAiProvider();
  if (!provider) return { version: AI_CONSENT_VERSION, provider: null, providerName: null, allowed: false, decision: null, updatedAt: null };
  const result = await query<{ allowed: boolean; updated_at: string }>(
    "select allowed, updated_at from ai_data_consents where user_id = $1 and provider = $2 and disclosure_version = $3",
    [userId, provider, AI_CONSENT_VERSION]
  );
  const row = result.rows[0];
  return { version: AI_CONSENT_VERSION, provider, providerName: AI_PROVIDER_NAMES[provider], allowed: row?.allowed === true, decision: row?.allowed ?? null, updatedAt: row?.updated_at ?? null };
}

export async function saveAiConsent(userId: string, input: { provider: AiDataProvider; version: string; allowed: boolean }) {
  if (input.provider !== currentAiProvider() || input.version !== AI_CONSENT_VERSION) {
    throw Object.assign(new Error("The AI provider or disclosure has changed. Reload AI privacy and review it before choosing."), { status: 409 });
  }
  await query(
    `insert into ai_data_consents (user_id, provider, disclosure_version, allowed)
     values ($1, $2, $3, $4)
     on conflict (user_id, provider, disclosure_version) do update set allowed = excluded.allowed, updated_at = now()`,
    [userId, input.provider, input.version, input.allowed]
  );
  return getAiConsent(userId);
}

// Every provider network call rechecks persisted permission. No cookie, client
// header, role, premium entitlement, or background job can imply permission.
export async function assertAiProviderConsent(provider: AiDataProvider) {
  const subjects = aiSubjects.getStore();
  if (!subjects?.length || provider !== currentAiProvider()) throw new AiConsentRequiredError();
  const result = await query<{ user_id: string }>(
    `select user_id from ai_data_consents where user_id = any($1::uuid[])
     and provider = $2 and disclosure_version = $3 and allowed = true`,
    [subjects, provider, AI_CONSENT_VERSION]
  );
  const allowed = new Set(result.rows.map(row => row.user_id));
  if (!subjects.every(id => allowed.has(id))) throw new AiConsentRequiredError();
}
