import { calculateDailyComplianceScores } from "./complianceJob";
import { generateRiskAlerts } from "./riskAlertJob";
import { sendHomeworkDueNotifications } from "../services/trainerHomeworkService";

export async function runDailyJobs() {
  await calculateDailyComplianceScores();
  await generateRiskAlerts();
  await sendHomeworkDueNotifications();
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
