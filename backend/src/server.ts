import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { adminRouter } from "./routes/admin";
import { aiRouter } from "./routes/ai";
import { authRouter } from "./routes/auth";
import { gymsRouter } from "./routes/gyms";
import { habitsRouter } from "./routes/habits";
import { healthRouter } from "./routes/health";
import { jobsRouter } from "./routes/jobs";
import { logsRouter } from "./routes/logs";
import { meRouter } from "./routes/me";
import { messagesRouter } from "./routes/messages";
import { missionsRouter } from "./routes/missions";
import { notificationsRouter } from "./routes/notifications";
import { progressRouter } from "./routes/progress";
import { referralsRouter } from "./routes/referrals";
import { reportsRouter } from "./routes/reports";
import { subscriptionsRouter } from "./routes/subscriptions";
import { athleteRouter } from "./routes/athlete";
import { trainerRouter } from "./routes/trainer";
import { waitlistRouter } from "./routes/waitlist";
import { complianceRouter } from "./routes/compliance";
import { errorHandler } from "./middleware/errors";
import { ensureAiUsageSchema } from "./services/aiUsageService";
import { ensureUserProfileSchema } from "./services/userService";
import { ensureWaitlistSchema } from "./services/waitlistService";
import { ensureSubscriptionSchema } from "./services/subscriptionSchemaService";
import { ensureNotificationSchema } from "./services/notificationService";

export const app = express();
const corsOrigins = env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({ origin: corsOrigins.length > 1 ? corsOrigins : corsOrigins[0], credentials: true }));
app.use(express.json({
  limit: "10mb",
  verify: (req, _res, buffer) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  }
}));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));
app.use(rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment and try again." }
}));
app.use("/api/v1", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

app.use("/api/v1", healthRouter);
app.use("/api/v1", jobsRouter);
app.use("/api/v1", authRouter);
app.use("/api/v1", meRouter);
app.use("/api/v1", messagesRouter);
app.use("/api/v1", missionsRouter);
app.use("/api/v1", notificationsRouter);
app.use("/api/v1", gymsRouter);
app.use("/api/v1", referralsRouter);
app.use("/api/v1", logsRouter);
app.use("/api/v1", habitsRouter);
app.use("/api/v1", progressRouter);
app.use("/api/v1", complianceRouter);
app.use("/api/v1", reportsRouter);
app.use("/api/v1", trainerRouter);
app.use("/api/v1", waitlistRouter);
app.use("/api/v1", adminRouter);
app.use("/api/v1", aiRouter);
app.use("/api/v1", subscriptionsRouter);
app.use("/api/v1", athleteRouter);
app.use(errorHandler);

Promise.all([ensureAiUsageSchema(), ensureUserProfileSchema(), ensureWaitlistSchema(), ensureSubscriptionSchema(), ensureNotificationSchema()])
  .catch((error) => {
    console.error("Schema setup failed", error);
  })
  .finally(() => {
    app.listen(env.PORT, () => {
      console.log(`Ascend API listening on ${env.PORT}`);
    });
  });
