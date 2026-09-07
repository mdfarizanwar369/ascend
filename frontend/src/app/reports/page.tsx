import { PlanGate } from "@/components/PlanGate";
import { WeeklyReportClient } from "@/components/reports/WeeklyReportClient";

export default function ReportsPage() {
  return (
    <PlanGate requiredPlan="premium" featureKey="premium.weeklyReports">
      <WeeklyReportClient />
    </PlanGate>
  );
}
