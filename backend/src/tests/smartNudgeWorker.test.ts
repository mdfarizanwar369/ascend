import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSmartNudgeWorker } from "../services/smartNudgeWorker";

describe("durable nudge worker lifecycle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does nothing when disabled", async () => {
    const run = vi.fn(); const retain = vi.fn();
    const stop = startSmartNudgeWorker({ enabled: false, run, retain });
    await vi.advanceTimersByTimeAsync(120_000);
    await stop();
    expect(run).not.toHaveBeenCalled(); expect(retain).not.toHaveBeenCalled();
  });

  it("avoids overlap and drains in-flight work on shutdown", async () => {
    let finish!: () => void;
    const run = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const retain = vi.fn();
    const stop = startSmartNudgeWorker({ enabled: true, run, retain, report: vi.fn() });
    await vi.advanceTimersByTimeAsync(180_000);
    expect(run).toHaveBeenCalledTimes(1);
    let drained = false;
    const stopping = stop().then(() => { drained = true; });
    await Promise.resolve(); expect(drained).toBe(false);
    finish(); await stopping;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(1); expect(retain).not.toHaveBeenCalled();
  });

  it("recovers after an error without leaking it and retains once daily", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("private provider payload")).mockResolvedValue({ processed: 0 });
    const retain = vi.fn().mockResolvedValue(undefined); const report = vi.fn();
    const stop = startSmartNudgeWorker({ enabled: true, run, retain, report });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(3); expect(retain).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith("tick_failed");
    expect(JSON.stringify(report.mock.calls)).not.toContain("private provider");
    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(retain).toHaveBeenCalledTimes(2);
    await stop();
  });
});
