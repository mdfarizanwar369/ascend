import { calculateDailyComplianceScores } from "./complianceJob";
import { generateRiskAlerts } from "./riskAlertJob";
import { sendHomeworkDueNotifications } from "../services/trainerHomeworkService";
import { recordJobResult, structuredLog } from "../observability/logger";
import { cleanupAbandonedMediaUploads } from "../services/mediaUploadService";
import { retryPendingAccountDeletions } from "../services/accountDeletionService";

export async function runDailyJobs() {
  const startedAt = Date.now();
  try {
    await calculateDailyComplianceScores();
    await generateRiskAlerts();
    await sendHomeworkDueNotifications();
    const abandonedUploads = await cleanupAbandonedMediaUploads();
    const deletionRetries = await retryPendingAccountDeletions();
    structuredLog("info", "daily_maintenance_complete", { abandonedUploads, deletionRetries });
    recordJobResult("daily", true, Date.now() - startedAt);
  } catch (error) {
    recordJobResult("daily", false, Date.now() - startedAt);
    throw error;
  }
}

if (require.main === module) {
  runDailyJobs()
    .then(() => {
      structuredLog("info", "daily_jobs_process_complete");
      process.exit(0);
    })
    .catch((error) => {
      structuredLog("error", "daily_jobs_process_failed", { error });
      process.exit(1);
    });
}
