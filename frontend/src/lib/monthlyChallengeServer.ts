import { isAscendNativeUserAgent } from "@ascend/shared";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { monthlyChallengesEnabled } from "./monthlyChallengeFlag";

export async function requireMonthlyChallengesOnWeb() {
  if (!monthlyChallengesEnabled) notFound();
  const request = await headers();
  if (isAscendNativeUserAgent(request.get("user-agent") ?? "") || request.get("x-ascend-edition")?.startsWith("ios-")) notFound();
}
