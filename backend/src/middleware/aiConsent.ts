import { NextFunction, Request, Response } from "express";
import { assertAiProviderConsent, currentAiProvider } from "../services/aiConsentService";

export async function requireAiConsent(_req: Request, _res: Response, next: NextFunction) {
  try {
    const provider = currentAiProvider();
    if (provider) await assertAiProviderConsent(provider);
    next();
  } catch (error) {
    next(error);
  }
}
