import { describe, expect, it } from "vitest";
import { normalizeAscendUrl } from "./CapacitorAppUrlRouter";

describe("Ascend native URL routing", () => {
  it("opens only safe app-relative widget destinations", () => {
    expect(normalizeAscendUrl("ascend://open?path=%2Fwater-log")).toBe("/water-log");
    expect(normalizeAscendUrl("ascend://open?path=%2Ffood-log%3Fsource%3Dwidget")).toBe("/food-log?source=widget");
    expect(normalizeAscendUrl("ascend://open?path=https%3A%2F%2Fevil.example")).toBeNull();
    expect(normalizeAscendUrl("ascend://other?path=%2Fdashboard")).toBeNull();
    expect(normalizeAscendUrl("ascend://open?path=%2F%2Fevil.example")).toBeNull();
  });
});
