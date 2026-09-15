export const AI_CONSENT_VERSION = "2026-09-15-v1";
export const AI_PROVIDER_NAMES = { gemini: "Google Gemini (Google)", openai: "OpenAI" } as const;
export type AiDataProvider = keyof typeof AI_PROVIDER_NAMES;

export const AI_DATA_CATEGORIES = [
  "Food photos and meal descriptions you submit for an estimate.",
  "Messages you send to Zoe, relevant earlier AI conversations, and workout notes or questions you enter.",
  "Your fitness profile (name, age, sex, height, weight and goals) and relevant meal, hydration, activity, habit, recovery and progress records, including progress photo references, used to personalize guidance. This can include activity imported from Health Connect if connected.",
  "Body composition report images and measurements when you use AI scan features. Images may contain personal details printed on the report."
] as const;

export interface AiConsentStatus {
  version: string;
  provider: AiDataProvider | null;
  providerName: string | null;
  allowed: boolean;
  decision: boolean | null;
  updatedAt: string | null;
}
