import { describe, expect, it } from "vitest";
import { rememberNativeLaunch, wasNativeLaunchHandled } from "./nativeRouteHandoff";

function memoryStorage(initialValue: string | null = null) {
  let value = initialValue;
  return {
    getItem: () => value,
    setItem: (_key: string, nextValue: string) => {
      value = nextValue;
    }
  };
}

describe("native route handoff", () => {
  it("remembers a launch across the reload used to reach its destination", () => {
    const storage = memoryStorage();
    const target = "/dashboard?panel=recovery&source=widget";

    expect(wasNativeLaunchHandled(storage, target)).toBe(false);
    rememberNativeLaunch(storage, target);
    expect(wasNativeLaunchHandled(storage, target)).toBe(true);
  });

  it("keeps earlier destinations handled when a later widget route arrives", () => {
    const storage = memoryStorage();
    rememberNativeLaunch(storage, "/water-log");
    rememberNativeLaunch(storage, "/dashboard?panel=recovery&source=widget");

    expect(wasNativeLaunchHandled(storage, "/water-log")).toBe(true);
    expect(wasNativeLaunchHandled(storage, "/dashboard?panel=recovery&source=widget")).toBe(true);
  });

  it("recovers safely from malformed stored state", () => {
    const storage = memoryStorage("not-json");
    expect(wasNativeLaunchHandled(storage, "/dashboard")).toBe(false);
    expect(() => rememberNativeLaunch(storage, "/dashboard")).not.toThrow();
    expect(wasNativeLaunchHandled(storage, "/dashboard")).toBe(true);
  });
});
