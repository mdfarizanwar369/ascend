import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLocalDateKey } from "./useLocalDateKey";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("local day while the app stays mounted", () => {
  it("rolls over at local midnight and schedules the following day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 25, 23, 59, 59));
    const { result } = renderHook(useLocalDateKey);
    expect(result.current).toBe("2026-10-25");
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe("2026-10-26");
    act(() => vi.advanceTimersByTime(24 * 60 * 60 * 1_000));
    expect(result.current).toBe("2026-10-27");
  });

  it.each(["focus", "pageshow", "visibilitychange"])("catches up after suspension on %s", (event) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 25, 22));
    const { result, unmount } = renderHook(useLocalDateKey);
    vi.setSystemTime(new Date(2026, 9, 27, 8));
    act(() => (event === "visibilitychange" ? document : window).dispatchEvent(new Event(event)));
    expect(result.current).toBe("2026-10-27");
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
