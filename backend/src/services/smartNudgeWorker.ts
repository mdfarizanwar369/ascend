import { env } from "../config/env";
import { nudgesSchemaEnabled } from "./smartNudgePolicy";
import { nudgeQueueHealth, retainNudgeHistory, runSmartNudges } from "./smartNudgeService";

const minute = 60_000;
const day = 24 * 60 * minute;

/** The database owns schedules and delivery claims. This timer only wakes the durable queue. */
export function startSmartNudgeWorker(options: {
  enabled?: boolean;
  run?: () => Promise<unknown>;
  retain?: () => Promise<unknown>;
  report?: (event: string, result?: unknown) => void;
} = {}) {
  const enabled = options.enabled ?? (env.ZOE_SMART_NUDGES_WORKER && nudgesSchemaEnabled());
  const run = options.run ?? (async () => ({ ...await runSmartNudges(), queue: await nudgeQueueHealth() }));
  const retain = options.retain ?? retainNudgeHistory;
  // Do not log provider tokens, user identities or exception payloads.
  const report = options.report ?? ((event, result) => console.info(`[smart-nudges] ${event}`, result ?? ""));
  let stopped = false;
  let active: Promise<void> | undefined;
  let nextRetention = 0;
  const tick = () => {
    if (stopped || active) return;
    active = (async () => {
      try { report("tick", await run()); } catch { report("tick_failed"); }
      if (!stopped && Date.now() >= nextRetention) {
        try {
          await retain();
          nextRetention = Date.now() + day;
          report("retention_complete");
        } catch { report("retention_failed"); }
      }
    })().finally(() => { active = undefined; });
  };
  const timer = enabled ? setInterval(tick, minute) : undefined;
  timer?.unref();
  if (enabled) { report("started"); tick(); }
  return async () => {
    stopped = true;
    if (timer) clearInterval(timer);
    await active;
  };
}
