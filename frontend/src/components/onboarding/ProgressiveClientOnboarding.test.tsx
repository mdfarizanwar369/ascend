import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeOnboarding: vi.fn(),
  getMe: vi.fn(),
  push: vi.fn(),
  searchParamsGet: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => ({ get: mocks.searchParamsGet })
}));

vi.mock("@/lib/ascendApi", () => ({
  completeOnboarding: mocks.completeOnboarding,
  getMe: mocks.getMe
}));

import { ProgressiveClientOnboarding } from "./ProgressiveClientOnboarding";

const draftKey = "ascend:onboarding:v2:draft";
const welcomeSeenKey = "ascend:onboarding:v2:welcome-seen";

async function renderProfileFlow() {
  window.localStorage.setItem(welcomeSeenKey, "profile");
  render(<ProgressiveClientOnboarding />);
  await screen.findByText("Step 1 of 6");
}

async function reachBarrierStep() {
  await renderProfileFlow();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  fireEvent.change(screen.getByLabelText("Age"), { target: { value: "30" } });
  fireEvent.change(screen.getByLabelText("Height"), { target: { value: "165" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  fireEvent.change(screen.getByLabelText("Current weight"), { target: { value: "75" } });
  fireEvent.change(screen.getByLabelText(/^Target weight/), { target: { value: "65" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "What usually makes it difficult to stay consistent?" });
}

describe("progressive onboarding human context", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    mocks.searchParamsGet.mockReturnValue(null);
    mocks.getMe.mockResolvedValue({ user: { full_name: "Sally", email: "sally@example.com" }, roles: ["client"] });
    mocks.completeOnboarding.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("stores a selected barrier and motivation anchor when onboarding completes", async () => {
    await reachBarrierStep();
    fireEvent.click(screen.getByRole("button", { name: "Life gets too busy" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "My family" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(mocks.completeOnboarding).toHaveBeenCalledWith(expect.objectContaining({
      goalType: "fat_loss",
      ageYears: 30,
      heightCm: 165,
      startingWeightKg: 75,
      targetWeightKg: 65,
      primaryBarrier: "too_busy",
      motivationAnchor: "family"
    })));
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("allows the optional motivation anchor to be skipped without blocking completion", async () => {
    await reachBarrierStep();
    fireEvent.click(screen.getByRole("button", { name: "I lose motivation" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));

    await waitFor(() => expect(mocks.completeOnboarding).toHaveBeenCalledWith(expect.objectContaining({
      primaryBarrier: "motivation_loss",
      motivationAnchor: null
    })));
  });

  it("restores both selections and the current step after a reload", async () => {
    await reachBarrierStep();
    fireEvent.click(screen.getByRole("button", { name: "Stress or tiredness takes over" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "My health" }));

    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(draftKey) ?? "{}")).toMatchObject({
      step: 5,
      primaryBarrier: "stress_or_fatigue",
      motivationAnchor: "health"
    }));

    cleanup();
    render(<ProgressiveClientOnboarding />);
    await screen.findByText("Step 6 of 6");
    expect(screen.getByRole("button", { name: "My health" })).toHaveAttribute("aria-pressed", "true");
  });

  it("retains selections when moving backward and forward", async () => {
    await reachBarrierStep();
    fireEvent.click(screen.getByRole("button", { name: "I'm unsure what to do" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "My confidence" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("button", { name: "I'm unsure what to do" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("button", { name: "My confidence" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not advance past the required barrier until one is selected", async () => {
    await reachBarrierStep();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Please choose the option that fits you best.");
    expect(screen.getByText("Step 5 of 6")).toBeInTheDocument();
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
  });

  it.each([320, 390, 430])("keeps both added choice screens usable at a %ipx mobile viewport", async (width) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    window.localStorage.setItem(welcomeSeenKey, "profile");
    window.localStorage.setItem(draftKey, JSON.stringify({
      step: 4,
      referralCode: "",
      goalChoice: "fat_loss",
      ageYears: "30",
      heightCm: "165",
      gender: "female",
      currentWeightKg: "75",
      targetWeightKg: "65",
      activityLevel: "moderate",
      primaryBarrier: null,
      motivationAnchor: null
    }));

    render(<ProgressiveClientOnboarding />);
    await screen.findByText("Step 5 of 6");
    expect(screen.getAllByRole("button")).toEqual(expect.arrayContaining([
      screen.getByRole("button", { name: "Life gets too busy" }),
      screen.getByRole("button", { name: "Continue" })
    ]));

    fireEvent.click(screen.getByRole("button", { name: "Life gets too busy" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("button", { name: "Skip for now" })).toBeVisible();
  });
});
