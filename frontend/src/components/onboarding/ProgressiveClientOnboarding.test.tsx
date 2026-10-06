import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeOnboarding: vi.fn(),
  getMe: vi.fn(),
  getMyNutritionTargets: vi.fn(),
  push: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push })
}));

vi.mock("@/lib/ascendApi", () => ({
  completeOnboarding: mocks.completeOnboarding,
  getMe: mocks.getMe,
  getMyNutritionTargets: mocks.getMyNutritionTargets
}));

import { ProgressiveClientOnboarding } from "./ProgressiveClientOnboarding";

const draftKey = "ascend:onboarding:v2:draft";

async function renderOnboarding() {
  render(<ProgressiveClientOnboarding />);
  await screen.findByText("1 of 3");
}

async function reachStartingPoint(goal: "Lose weight" | "Maintain & feel healthier" = "Lose weight") {
  await renderOnboarding();
  fireEvent.click(screen.getByRole("button", { name: goal }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  fireEvent.change(screen.getByLabelText("Age"), { target: { value: "32" } });
  fireEvent.change(screen.getByLabelText("Height"), { target: { value: "170" } });
  fireEvent.change(screen.getByLabelText("Sex for calorie estimate"), { target: { value: "female" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("3 of 3");
}

describe("simple personalized onboarding", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    mocks.getMe.mockResolvedValue({ user: { full_name: "Sally", email: "sally@example.com" }, roles: ["client"] });
    mocks.completeOnboarding.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getMyNutritionTargets.mockResolvedValue({
      targets: { calories: 2050, proteinG: 125, carbsG: 230, fatG: 64, waterMl: 2300 }
    });
  });

  it("starts with only three meaningful goal choices and one primary action", async () => {
    await renderOnboarding();

    expect(screen.getByRole("heading", { name: "What would you like to achieve?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lose weight" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Build muscle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Maintain & feel healthier" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explore first" })).toBeInTheDocument();
    expect(screen.queryByText("Log Food")).not.toBeInTheDocument();
    expect(screen.queryByText(/motivation/i)).not.toBeInTheDocument();
  });

  it("saves the essential profile and shows the resolved starting guide before entering Today", async () => {
    await reachStartingPoint();
    fireEvent.change(screen.getByLabelText("Current weight"), { target: { value: "82" } });
    fireEvent.change(screen.getByLabelText(/^Target weight/), { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: "Some movement" }));
    fireEvent.click(screen.getByRole("button", { name: "Create my guide" }));

    await screen.findByRole("heading", { name: "Your starting guide is ready" });
    expect(mocks.completeOnboarding).toHaveBeenCalledWith({
      fullName: "Sally",
      referralCode: undefined,
      coachingMode: "self_coached",
      goalType: "fat_loss",
      gender: "female",
      ageYears: 32,
      heightCm: 170,
      activityLevel: "moderate",
      startingWeightKg: 82,
      targetWeightKg: 75
    });
    expect(mocks.getMyNutritionTargets).toHaveBeenCalledTimes(1);
    expect(screen.getByText("2,050")).toBeInTheDocument();
    expect(screen.getByText("125 g")).toBeInTheDocument();
    expect(screen.getByText("2.3 L")).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Go to Today/ }));
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("allows maintenance without a target weight", async () => {
    await reachStartingPoint("Maintain & feel healthier");
    fireEvent.change(screen.getByLabelText("Current weight"), { target: { value: "70" } });
    fireEvent.click(screen.getByRole("button", { name: "Create my guide" }));

    await waitFor(() => expect(mocks.completeOnboarding).toHaveBeenCalledWith(expect.objectContaining({
      goalType: "maintenance",
      startingWeightKg: 70,
      targetWeightKg: undefined
    })));
  });

  it("keeps required profile validation focused on the current screen", async () => {
    await renderOnboarding();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("alert")).toHaveTextContent("You must be 18 or older");
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
  });

  it("migrates an old six-step draft into the final essential-details screen", async () => {
    window.localStorage.setItem(draftKey, JSON.stringify({
      step: 5,
      referralCode: "",
      goalChoice: "performance",
      ageYears: "30",
      heightCm: "165",
      gender: "female",
      currentWeightKg: "75",
      targetWeightKg: "",
      activityLevel: "high",
      primaryBarrier: "too_busy",
      motivationAnchor: "family"
    }));

    render(<ProgressiveClientOnboarding />);
    await screen.findByText("3 of 3");
    expect(screen.getByRole("heading", { name: "Your starting point" })).toBeInTheDocument();
    expect(screen.getByLabelText("Current weight")).toHaveValue("75");
    expect(screen.getByRole("button", { name: "Active most days" })).toHaveAttribute("aria-pressed", "true");
  });

  it("uses the same profile calculation if the guide endpoint is temporarily unavailable", async () => {
    mocks.getMyNutritionTargets.mockRejectedValueOnce(new Error("offline"));
    await reachStartingPoint();
    fireEvent.change(screen.getByLabelText("Current weight"), { target: { value: "82" } });
    fireEvent.change(screen.getByLabelText(/^Target weight/), { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: "Create my guide" }));

    expect(await screen.findByRole("heading", { name: "Your starting guide is ready" })).toBeInTheDocument();
    expect(screen.getByText("2.5 L")).toBeInTheDocument();
  });
});
