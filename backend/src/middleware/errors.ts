import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function errorHandler(error: Error, _req: Request, res: Response, _next: NextFunction) {
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

  res.status(500).json({
    error: "Internal server error",
    detail: process.env.NODE_ENV === "production" ? undefined : error.message
  });
}
