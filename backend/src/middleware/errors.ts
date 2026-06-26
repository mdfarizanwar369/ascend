import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function errorHandler(error: Error, _req: Request, res: Response, _next: NextFunction) {
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

  const status = (error as Error & { status?: number }).status;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: error.message });
  }

  res.status(500).json({
    error: "Internal server error",
    detail: process.env.NODE_ENV === "production" ? undefined : error.message
  });
}
