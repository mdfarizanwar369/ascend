import { isAscendNativeUserAgent, supportsAscendIosCycle } from "@ascend/shared";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { monthlyChallengesEnabled } from "./monthlyChallengeFlag";

export async function requireMonthlyChallengesAvailable() {
  if (!monthlyChallengesEnabled) notFound();
  const request = await headers();
  const userAgent = request.get("user-agent") ?? "";
  const native = isAscendNativeUserAgent(userAgent) || request.get("x-ascend-edition")?.startsWith("ios-");
  if (native && !supportsAscendIosCycle(userAgent)) notFound();
}
