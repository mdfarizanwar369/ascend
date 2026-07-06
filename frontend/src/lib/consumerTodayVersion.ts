export type ConsumerTodayVersion = "v1" | "v2";

export function getConsumerTodayVersion(): ConsumerTodayVersion {
  const configured = process.env.NEXT_PUBLIC_CONSUMER_TODAY_V2 ?? process.env.CONSUMER_TODAY_V2 ?? "false";
  return configured === "true" || configured === "1" || configured === "v2" ? "v2" : "v1";
}

export function isConsumerTodayV2Enabled() {
  return getConsumerTodayVersion() === "v2";
}
