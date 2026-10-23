"use client";

import { registerPlugin } from "@capacitor/core";
import type { AscendAppearance } from "@/lib/ascendAppearance";

export type AscendSiriStatus = {
  supported: boolean;
  connected: boolean;
  firebaseUid?: string;
  expiresAt?: string;
};

export const ascendSiri = registerPlugin<{
  status(): Promise<AscendSiriStatus>;
  connect(options: { apiBaseUrl: string; firebaseToken: string; firebaseUid: string }): Promise<{ connected: boolean; expiresAt: string }>;
  refreshWidget(): Promise<{ refreshed: boolean }>;
  getWidgetTheme(): Promise<{ theme: AscendAppearance; availableThemes?: AscendAppearance[] }>;
  setWidgetTheme(options: { theme: AscendAppearance }): Promise<{ theme: AscendAppearance }>;
  disconnect(): Promise<void>;
}>("AscendSiri");
