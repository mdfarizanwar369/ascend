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
  speech.startMealSpeechRecognition.mockReset();
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
  it("replaces the transcript across ten consecutive voice meal sessions", async () => {
    const transcripts = [
      "chicken rice",
      "oats and honey",
      "banana and milk",
      "nasi lemak",
      "protein shake",
      "two eggs and toast",
      "sushi eight pieces",
      "beef noodles",
      "apple and yogurt",
      "laksa with boiled egg"
    ];
    for (const transcript of transcripts) {
      speech.startMealSpeechRecognition.mockResolvedValueOnce({
        transcript,
        confidence: 0.9,
        alternatives: [transcript],
        source: "browser"
      });
    }

    render(<FoodLogClient />);
    await screen.findByRole("button", { name: "Speak meal" });
    let description: HTMLElement | null = null;

    for (const [index, transcript] of transcripts.entries()) {
      fireEvent.click(screen.getByRole("button", { name: index === 0 ? "Speak meal" : "Speak again" }));
      description ??= await screen.findByLabelText("What did you eat?");
      await waitFor(() => expect(description).toHaveValue(transcript));
    }
    expect(speech.startMealSpeechRecognition).toHaveBeenCalledTimes(10);
    expect(screen.getByText("Voice is used only while listening. Ascend keeps the text, not the recording.")).toBeInTheDocument();

    fireEvent.change(description!, { target: { value: "laksa, boiled egg and tofu" } });
    fireEvent.click(screen.getByRole("button", { name: "Analyse meal" }));

    await waitFor(() => expect(api.estimateFoodFromText).toHaveBeenCalledWith("laksa, boiled egg and tofu"));
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

  it("restores every meal-entry control after speech recognition times out", async () => {
    speech.startMealSpeechRecognition.mockRejectedValue(
      Object.assign(new Error("Listening took too long. Nothing was saved, so you can try again or type the meal."), { code: "speech_timeout" })
    );
    render(<FoodLogClient />);

    fireEvent.click(await screen.findByRole("button", { name: "Speak meal" }));

    expect(await screen.findByText("Listening took too long. Nothing was saved, so you can try again or type the meal.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Speak meal" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Type meal" })).toBeEnabled();
    expect(screen.getByLabelText("What did you eat?")).toBeEnabled();
  });
});
