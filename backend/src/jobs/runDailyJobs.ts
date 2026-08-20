import { calculateDailyComplianceScores } from "./complianceJob";
import { generateRiskAlerts } from "./riskAlertJob";
import { sendHomeworkDueNotifications } from "../services/trainerHomeworkService";
import { cleanupExpiredDailyCoachingDecisions } from "../services/dailyCoachingDecisionService";
import { retryPendingImmediateAccountDeletions } from "../services/accountDeletionService";

export async function runDailyJobs() {
  let scheduledJobError: unknown;
  try {
    await calculateDailyComplianceScores();
    await generateRiskAlerts();
    await sendHomeworkDueNotifications();
    await cleanupExpiredDailyCoachingDecisions();
  } catch (error) {
    scheduledJobError = error;
  }

  let deletionRetryError: unknown;
  try {
    await retryPendingImmediateAccountDeletions();
  } catch (error) {
    deletionRetryError = error;
  }

  if (scheduledJobError && deletionRetryError) {
    throw new AggregateError([scheduledJobError, deletionRetryError], "Daily Ascend jobs and account deletion retry both failed.");
  }
  if (scheduledJobError) throw scheduledJobError;
  if (deletionRetryError) throw deletionRetryError;
}

if (require.main === module) {
  runDailyJobs()
    .then(() => {
      console.log("Daily Ascend jobs complete");
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
