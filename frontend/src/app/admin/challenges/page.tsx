import { MonthlyChallengesPage } from "@/components/challenges/MonthlyChallengesPage";
import { requireMonthlyChallengesOnWeb } from "@/lib/monthlyChallengeServer";

export default async function Page() {
  await requireMonthlyChallengesOnWeb();
  return <MonthlyChallengesPage role="gym" />;
}
