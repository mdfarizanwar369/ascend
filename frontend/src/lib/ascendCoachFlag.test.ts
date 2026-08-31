import { afterEach, describe, expect, it } from "vitest";
import { ascendCoachV1Enabled } from "./ascendCoachFlag";

describe("Ascend Coach frontend flag", () => {
  const original = process.env.NEXT_PUBLIC_ASCEND_COACH_V1;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_ASCEND_COACH_V1;
    else process.env.NEXT_PUBLIC_ASCEND_COACH_V1 = original;
  });

  it("defaults off", () => {
    delete process.env.NEXT_PUBLIC_ASCEND_COACH_V1;
    expect(ascendCoachV1Enabled()).toBe(false);
  });

  it("requires an explicit true value", () => {
    process.env.NEXT_PUBLIC_ASCEND_COACH_V1 = "true";
    expect(ascendCoachV1Enabled()).toBe(true);
  });
});
