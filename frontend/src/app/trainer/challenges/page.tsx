import { MonthlyChallengesPage } from "@/components/challenges/MonthlyChallengesPage";
import { requireMonthlyChallengesAvailable } from "@/lib/monthlyChallengeServer";

export default async function Page() {
  await requireMonthlyChallengesAvailable();
  return <MonthlyChallengesPage role="trainer" />;
}
