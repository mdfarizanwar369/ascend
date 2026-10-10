"use client";

import { registerPlugin } from "@capacitor/core";

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
  disconnect(): Promise<void>;
}>("AscendSiri");
