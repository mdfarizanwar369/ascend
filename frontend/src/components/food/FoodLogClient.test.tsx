import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FoodLogClient } from "./FoodLogClient";

const api = vi.hoisted(() => ({
  estimateFoodFromDataUrl: vi.fn(),
  estimateFoodFromText: vi.fn(),
  getFoodLogs: vi.fn(),
  getFoodAiAllowance: vi.fn(),
  getMe: vi.fn(),
  getMyNutritionTargets: vi.fn(),
  getWeightLogs: vi.fn(),
  saveFoodLog: vi.fn(),
  uploadFoodPhotoDataUrl: vi.fn()
}));

const speech = vi.hoisted(() => ({
  getMealSpeechAvailability: vi.fn(),
  startMealSpeechRecognition: vi.fn(),
  stopMealSpeechRecognition: vi.fn(),
  cancelMealSpeechRecognition: vi.fn()
}));

vi.mock("@/lib/ascendApi", () => ({
  estimateFoodFromDataUrl: api.estimateFoodFromDataUrl,
  estimateFoodFromText: api.estimateFoodFromText,
  deleteFoodLog: vi.fn(),
  getFoodAiAllowance: api.getFoodAiAllowance,
  getFoodLogs: api.getFoodLogs,
  getMe: api.getMe,
  getMyNutritionTargets: api.getMyNutritionTargets,
  getWeightLogs: api.getWeightLogs,
  saveFoodLog: api.saveFoodLog,
  uploadFoodPhotoDataUrl: api.uploadFoodPhotoDataUrl
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
  api.saveFoodLog.mockResolvedValue({
    foodLog: {
      id: "meal-1",
      image_s3_key: null,
      meal_type: "lunch",
      estimated_food_name: "Chicken rice",
      calories: 325,
      protein_g: 7,
      carbs_g: 71,
      fat_g: 1
    }
  });
  api.uploadFoodPhotoDataUrl.mockResolvedValue({ key: "food/member-1/photo.jpg" });
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

describe("Portion-aware meal review", () => {
  it("recalculates an item adjustment without another AI request and preserves original and final quantities on save", async () => {
    api.estimateFoodFromText.mockResolvedValueOnce({
      estimate: {
        foodName: "Chicken rice",
        confidence: 0.92,
        recognitionConfidence: 0.92,
        portionConfidence: 0.7,
        visiblePortionLabel: "regular",
        calories: 260,
        proteinG: 5,
        carbsG: 57,
        fatG: 0.6,
        notes: "Estimated from the visible portions in this photo.",
        analysisVersion: "portion_aware_v1",
        clarificationRequired: false,
        clarification: null,
        portionFallback: false,
        items: [{
          id: "portion-1-rice",
          name: "Rice",
          normalizedName: "cooked white rice",
          preparation: "steamed",
          estimatedQuantity: 200,
          finalQuantity: 200,
          unit: "g",
          foodConfidence: 0.95,
          portionConfidence: 0.72,
          visiblePortionLabel: "regular",
          notes: null,
          nutritionSource: "ai_estimate",
          portionSource: "ai_vision",
          nutritionBasis: {
            amount: 200,
            unit: "g",
            nutrition: { calories: 260, proteinG: 5, carbsG: 57, fatG: 0.6 },
            source: "ai_estimate",
            sourceDetail: "Visible photo estimate"
          },
          nutrition: { calories: 260, proteinG: 5, carbsG: 57, fatG: 0.6 },
          userAdjusted: false
        }]
      },
      allowance: null
    });

    render(<FoodLogClient />);
    fireEvent.click(await screen.findByRole("button", { name: "Type meal" }));
    fireEvent.change(screen.getByLabelText("What did you eat?"), { target: { value: "chicken rice" } });
    fireEvent.click(screen.getByRole("button", { name: "Analyse meal" }));

    expect(await screen.findByText("Estimated portion: Regular")).toBeInTheDocument();
    expect(screen.getAllByText("Estimated from your photo, not measured.").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Food match:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Portion estimate:/i)).not.toBeInTheDocument();
    expect(screen.getByText("~200g")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Owner pilot diagnostics" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adjust portions" }));
    fireEvent.click(screen.getByRole("button", { name: "Larger" }));

    await waitFor(() => expect(screen.getByLabelText("Rice quantity")).toHaveValue(250));
    expect(screen.getByText("~250g")).toBeInTheDocument();
    expect(api.estimateFoodFromText).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Save meal" }));
    await waitFor(() => expect(api.saveFoodLog).toHaveBeenCalledTimes(1));
    const saved = api.saveFoodLog.mock.calls[0][0];
    expect(saved.calories).toBe(325);
    expect(saved.portionAnalysis.items[0]).toMatchObject({
      estimatedQuantity: 200,
      finalQuantity: 250,
      userAdjusted: true
    });
  });

  it("does not offer generic smaller or larger shortcuts for countable whole-piece foods", async () => {
    api.estimateFoodFromText.mockResolvedValueOnce({
      estimate: {
        foodName: "French Fries",
        confidence: 0.95,
        recognitionConfidence: 0.95,
        portionConfidence: 0.86,
        visiblePortionLabel: "small",
        calories: 155,
        proteinG: 2,
        carbsG: 21,
        fatG: 7,
        notes: "Estimated from the visible portions in this photo.",
        analysisVersion: "portion_aware_v1",
        clarificationRequired: false,
        clarification: null,
        portionFallback: false,
        items: [{
          id: "portion-1-fries",
          name: "French Fries",
          normalizedName: "fried potato fries",
          preparation: "fried",
          estimatedQuantity: 5,
          finalQuantity: 5,
          unit: "piece",
          foodConfidence: 0.95,
          portionConfidence: 0.86,
          visiblePortionLabel: "small",
          notes: null,
          nutritionSource: "ai_estimate",
          portionSource: "ai_vision",
          nutritionBasis: {
            amount: 5,
            unit: "piece",
            nutrition: { calories: 155, proteinG: 2, carbsG: 21, fatG: 7 },
            source: "ai_estimate",
            sourceDetail: "Visible photo estimate"
          },
          nutrition: { calories: 155, proteinG: 2, carbsG: 21, fatG: 7 },
          userAdjusted: false
        }]
      },
      allowance: null
    });

    render(<FoodLogClient />);
    fireEvent.click(await screen.findByRole("button", { name: "Type meal" }));
    fireEvent.change(screen.getByLabelText("What did you eat?"), { target: { value: "five fries" } });
    fireEvent.click(screen.getByRole("button", { name: "Analyse meal" }));

    expect(await screen.findByText("~5 pieces")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adjust portions" }));

    expect(screen.getByText("Use the quantity field for countable foods so whole pieces stay clear.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Smaller" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Larger" })).not.toBeInTheDocument();
    expect(api.estimateFoodFromText).toHaveBeenCalledTimes(1);
  });

  it("shows source diagnostics only to the verified Platform Owner", async () => {
    api.getMe.mockResolvedValueOnce({
      user: { id: "owner-1", goal_type: "fat_loss", is_platform_owner: true }
    });
    api.estimateFoodFromText.mockResolvedValueOnce({
      estimate: {
        foodName: "Nasi Lemak",
        confidence: 0.94,
        recognitionConfidence: 0.94,
        portionConfidence: 0.7,
        visiblePortionLabel: "regular",
        calories: 390,
        proteinG: 12,
        carbsG: 55,
        fatG: 14,
        notes: "Estimated from the visible portions in this photo.",
        analysisVersion: "portion_aware_v1",
        portionFallback: false,
        items: [{
          id: "portion-1-nasi-lemak",
          name: "Nasi Lemak",
          normalizedName: "nasi lemak",
          estimatedQuantity: 180,
          finalQuantity: 180,
          unit: "g",
          foodConfidence: 0.94,
          portionConfidence: 0.7,
          visiblePortionLabel: "regular",
          nutritionSource: "ai_estimate",
          portionSource: "ai_vision",
          nutritionBasis: {
            amount: 180,
            unit: "g",
            nutrition: { calories: 390, proteinG: 12, carbsG: 55, fatG: 14 },
            source: "ai_estimate",
            sourceDetail: "Visible photo estimate"
          },
          nutrition: { calories: 390, proteinG: 12, carbsG: 55, fatG: 14 },
          userAdjusted: false,
          fallbackReason: "Local match has no compatible verified scalable basis."
        }]
      },
      allowance: null
    });

    render(<FoodLogClient />);
    fireEvent.click(await screen.findByRole("button", { name: "Type meal" }));
    fireEvent.change(screen.getByLabelText("What did you eat?"), { target: { value: "nasi lemak" } });
    fireEvent.click(screen.getByRole("button", { name: "Analyse meal" }));

    const diagnosticsButton = await screen.findByRole("button", { name: "Owner pilot diagnostics" });
    fireEvent.click(diagnosticsButton);

    expect(screen.getByTestId("owner-portion-diagnostics")).toHaveTextContent("Analysis version: portion_aware_v1");
    expect(screen.getByTestId("owner-portion-diagnostics")).toHaveTextContent("AI quantity: 180 g");
    expect(screen.getByTestId("owner-portion-diagnostics")).toHaveTextContent("Scalable database density: Unavailable");
    expect(screen.getByTestId("owner-portion-diagnostics")).toHaveTextContent("AI nutrition fallback: Yes");
  });
});
