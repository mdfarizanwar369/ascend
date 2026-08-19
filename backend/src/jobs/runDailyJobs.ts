import { calculateDailyComplianceScores } from "./complianceJob";
import { generateRiskAlerts } from "./riskAlertJob";
import { sendHomeworkDueNotifications } from "../services/trainerHomeworkService";
import { cleanupExpiredDailyCoachingDecisions } from "../services/dailyCoachingDecisionService";

export async function runDailyJobs() {
  await calculateDailyComplianceScores();
  await generateRiskAlerts();
  await sendHomeworkDueNotifications();
  await cleanupExpiredDailyCoachingDecisions();
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
