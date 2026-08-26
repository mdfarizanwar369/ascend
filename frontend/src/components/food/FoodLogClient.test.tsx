import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FoodLogClient } from "./FoodLogClient";

const api = vi.hoisted(() => ({
  estimateFoodFromText: vi.fn(),
  getFoodLogs: vi.fn(),
  getFoodAiAllowance: vi.fn(),
  getMe: vi.fn(),
  getMyNutritionTargets: vi.fn(),
  getWeightLogs: vi.fn()
}));

const speech = vi.hoisted(() => ({
  getMealSpeechAvailability: vi.fn(),
  startMealSpeechRecognition: vi.fn(),
  stopMealSpeechRecognition: vi.fn(),
  cancelMealSpeechRecognition: vi.fn()
}));

vi.mock("@/lib/ascendApi", () => ({
  estimateFoodFromDataUrl: vi.fn(),
  estimateFoodFromText: api.estimateFoodFromText,
  deleteFoodLog: vi.fn(),
  getFoodAiAllowance: api.getFoodAiAllowance,
  getFoodLogs: api.getFoodLogs,
  getMe: api.getMe,
  getMyNutritionTargets: api.getMyNutritionTargets,
  getWeightLogs: api.getWeightLogs,
  saveFoodLog: vi.fn(),
  uploadFoodPhotoDataUrl: vi.fn()
}));

vi.mock("@/lib/mealSpeech", () => ({
  cancelMealSpeechRecognition: speech.cancelMealSpeechRecognition,
  getMealSpeechAvailability: speech.getMealSpeechAvailability,
  isMealSpeechCancellation: (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "cancelled"),
  isMealSpeechPotentiallyAvailable: () => true,
  mealSpeechErrorMessage: (error: unknown) => error instanceof Error ? error.message : "Voice entry failed.",
  startMealSpeechRecognition: speech.startMealSpeechRecognition,
  stopMealSpeechRecognition: speech.stopMealSpeechRecognition
}));

vi.mock("@/lib/nativeImagePicker", () => ({ pickNativeImage: vi.fn() }));
vi.mock("@/lib/dataSync", () => ({ clearPendingFoodLog: vi.fn(), rememberSavedFoodLog: vi.fn() }));
vi.mock("@/lib/installAscend", () => ({ markInstallEligible: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));

beforeEach(() => {
  vi.clearAllMocks();
  api.getFoodLogs.mockResolvedValue({ foodLogs: [], nextOffset: null });
  api.getFoodAiAllowance.mockResolvedValue({ allowance: null });
  api.getMe.mockResolvedValue({ user: { id: "member-1", goal_type: "fat_loss" } });
  api.getMyNutritionTargets.mockResolvedValue({ targets: null });
  api.getWeightLogs.mockResolvedValue({ weightLogs: [] });
  api.estimateFoodFromText.mockResolvedValue({
    estimate: {
      foodName: "Chicken rice and teh tarik",
      confidence: 0.88,
      calories: 760,
      proteinG: 34,
      carbsG: 105,
      fatG: 22,
      notes: "Estimated from the meal description."
    },
    allowance: null
  });
  speech.getMealSpeechAvailability.mockResolvedValue({ available: true, source: "browser" });
  speech.stopMealSpeechRecognition.mockResolvedValue(undefined);
  speech.cancelMealSpeechRecognition.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("Food Log voice entry", () => {
  it("captures repeated speech, keeps it editable, and reuses text meal analysis", async () => {
    speech.startMealSpeechRecognition
      .mockResolvedValueOnce({ transcript: "chicken rice", confidence: 0.9, alternatives: ["chicken rice"], source: "browser" })
      .mockResolvedValueOnce({ transcript: "teh tarik kurang manis", confidence: 0.86, alternatives: ["teh tarik kurang manis"], source: "browser" });

    render(<FoodLogClient />);
    const speakButton = await screen.findByRole("button", { name: "Speak meal" });

    fireEvent.click(speakButton);
    const description = await screen.findByLabelText("What did you eat?");
    await waitFor(() => expect(description).toHaveValue("chicken rice"));

    fireEvent.click(screen.getByRole("button", { name: "Speak meal" }));
    await waitFor(() => expect(description).toHaveValue("chicken rice, teh tarik kurang manis"));
    expect(screen.getByText("Voice is used only while listening. Ascend keeps the text, not the recording.")).toBeInTheDocument();

    fireEvent.change(description, { target: { value: "chicken rice and teh tarik" } });
    fireEvent.click(screen.getByRole("button", { name: "Analyse meal" }));

    await waitFor(() => expect(api.estimateFoodFromText).toHaveBeenCalledWith("chicken rice and teh tarik"));
    expect(await screen.findByText("Chicken rice and teh tarik")).toBeInTheDocument();
  });

  it("keeps manual typing available when speech recognition is unavailable", async () => {
    speech.getMealSpeechAvailability.mockResolvedValue({ available: false, source: "none" });
    render(<FoodLogClient />);

    expect(await screen.findByRole("button", { name: "Type meal" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Speak meal" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Type meal" }));
    expect(screen.getByLabelText("What did you eat?")).toBeInTheDocument();
  });

  it("shows a recoverable message when recognition fails", async () => {
    speech.startMealSpeechRecognition.mockRejectedValue(new Error("I did not catch that meal. Try again and speak naturally."));
    render(<FoodLogClient />);

    fireEvent.click(await screen.findByRole("button", { name: "Speak meal" }));
    expect(await screen.findByText("I did not catch that meal. Try again and speak naturally.")).toBeInTheDocument();
    expect(screen.getByLabelText("What did you eat?")).toHaveValue("");
  });
});
