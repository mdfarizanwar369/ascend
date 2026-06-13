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
import { progressRouter } from "./routes/progress";
import { referralsRouter } from "./routes/referrals";
import { reportsRouter } from "./routes/reports";
import { subscriptionsRouter } from "./routes/subscriptions";
import { trainerRouter } from "./routes/trainer";
import { complianceRouter } from "./routes/compliance";
import { errorHandler } from "./middleware/errors";

export const app = express();
const corsOrigins = env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);

app.use(helmet());
app.use(cors({ origin: corsOrigins.length > 1 ? corsOrigins : corsOrigins[0], credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(rateLimit({ windowMs: 60_000, limit: 120 }));

app.use("/api/v1", healthRouter);
app.use("/api/v1", jobsRouter);
app.use("/api/v1", authRouter);
app.use("/api/v1", meRouter);
app.use("/api/v1", messagesRouter);
app.use("/api/v1", gymsRouter);
app.use("/api/v1", referralsRouter);
app.use("/api/v1", logsRouter);
app.use("/api/v1", habitsRouter);
app.use("/api/v1", progressRouter);
app.use("/api/v1", complianceRouter);
app.use("/api/v1", reportsRouter);
app.use("/api/v1", trainerRouter);
app.use("/api/v1", adminRouter);
app.use("/api/v1", aiRouter);
app.use("/api/v1", subscriptionsRouter);
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`Ascend API listening on ${env.PORT}`);
});
