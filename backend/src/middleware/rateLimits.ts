import rateLimit from "express-rate-limit";

function createLimiter(windowMs: number, limit: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: message }
  });
}

export const authRateLimit = createLimiter(15 * 60_000, 30, "Too many account requests. Please try again shortly.");
export const aiRateLimit = createLimiter(60_000, 20, "Too many AI requests. Please wait a moment and try again.");
export const todayPriorityRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? "authenticated-user",
  message: { error: "Today's coaching is refreshing too often. Please wait a moment and try again." }
});
export const uploadRateLimit = createLimiter(60_000, 20, "Too many upload requests. Please wait a moment and try again.");
export const waitlistRateLimit = createLimiter(15 * 60_000, 10, "Too many requests. Please try again later.");
