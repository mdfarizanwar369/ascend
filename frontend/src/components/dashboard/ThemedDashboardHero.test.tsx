import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemedDashboardHero } from "./ThemedDashboardHero";

afterEach(cleanup);

describe("themed dashboard balance", () => {
  it("shows the same target-minus-intake balance as the daily guide", () => {
    render(<ThemedDashboardHero calorieTarget={2300} caloriesLogged={560} calorieProgress={24} guideNeedsProfile={false} />);
    expect(screen.getByText("1,740")).toBeInTheDocument();
    expect(screen.getByText("kcal left")).toBeInTheDocument();
    expect(screen.getByText("560 of 2,300 kcal logged today")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /1,740 kcal left/ })).toHaveAttribute("href", "/food-log");
  });

  it("does not disguise an exceeded guide as calories left", () => {
    render(<ThemedDashboardHero calorieTarget={2000} caloriesLogged={2205} calorieProgress={100} guideNeedsProfile={false} />);
    expect(screen.getByText("205")).toBeInTheDocument();
    expect(screen.getByText("kcal above guide")).toBeInTheDocument();
    expect(screen.queryByText("kcal left")).not.toBeInTheDocument();
  });

  it("does not invent a balance without a valid guide", () => {
    render(<ThemedDashboardHero calorieTarget={0} caloriesLogged={0} calorieProgress={0} guideNeedsProfile />);
    expect(screen.getByText("Set your calorie guide")).toBeInTheDocument();
    expect(screen.queryByText("0", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set your calorie guide in Ascend" })).toHaveAttribute("href", "/profile/guide");
  });
});
