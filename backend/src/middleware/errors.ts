import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function errorHandler(error: Error, _req: Request, res: Response, _next: NextFunction) {
  const databaseCode = (error as Error & { code?: string }).code;

  if ((error as Error & { type?: string }).type === "entity.too.large") {
    return res.status(413).json({
      error: "Upload is too large",
      detail: "Please upload fewer images or retake the scan closer so Ascend can optimize a smaller file."
    });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: "Invalid request",
      issues: error.issues
    });
  }

  if (error.name === "PaymentProviderError") {
    return res.status(400).json({
      error: error.message
    });
  }

  if (databaseCode === "23505") {
    const message = error.message.toLowerCase();
    if (message.includes("users_email_key")) {
      return res.status(409).json({
        error: "This email already has an Ascend account",
        detail: "Please log in with your existing sign-in method or continue with the same Google account."
      });
    }

    if (message.includes("users_firebase_uid_key")) {
      return res.status(409).json({
        error: "This Ascend sign-in is already linked to another account",
        detail: "Please log in instead of creating a new account."
      });
    }
  }

  const status = (error as Error & { status?: number }).status;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: error.message });
  }

  res.status(500).json({
    error: "Internal server error",
    detail: process.env.NODE_ENV === "production" ? undefined : error.message
  });
}
