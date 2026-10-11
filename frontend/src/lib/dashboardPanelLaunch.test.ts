import { describe, expect, it } from "vitest";
import { consumeDashboardPanelLaunch } from "./dashboardPanelLaunch";

describe("dashboard panel launches", () => {
  it("opens and consumes a recovery request from the widget", () => {
    expect(consumeDashboardPanelLaunch(new URL("https://www.getascend.fit/dashboard?panel=recovery&source=widget"))).toEqual({
      panel: "recovery",
      cleanedPath: "/dashboard"
    });
  });

  it("preserves unrelated query values and the hash", () => {
    expect(consumeDashboardPanelLaunch(new URL("https://www.getascend.fit/dashboard?panel=recovery&campaign=autumn#today"))).toEqual({
      panel: "recovery",
      cleanedPath: "/dashboard?campaign=autumn#today"
    });
  });

  it("ignores unknown or missing panel requests", () => {
    expect(consumeDashboardPanelLaunch(new URL("https://www.getascend.fit/dashboard?panel=profile"))).toBeNull();
    expect(consumeDashboardPanelLaunch(new URL("https://www.getascend.fit/dashboard"))).toBeNull();
  });
});
