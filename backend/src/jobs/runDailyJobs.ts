import { calculateDailyComplianceScores } from "./complianceJob";
import { generateRiskAlerts } from "./riskAlertJob";

export async function runDailyJobs() {
  await calculateDailyComplianceScores();
  await generateRiskAlerts();
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

