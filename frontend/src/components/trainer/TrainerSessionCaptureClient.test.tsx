import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainerSessionCaptureClient } from "./TrainerSessionCaptureClient";

const api = vi.hoisted(() => ({
  cancelTrainerCoachingSession: vi.fn(),
  completeTrainerCoachingSession: vi.fn(),
  getTrainerSessionOverview: vi.fn(),
  interpretTrainerCoachingSession: vi.fn(),
  startTrainerCoachingSession: vi.fn(),
  updateTrainerCoachingSession: vi.fn()
}));
vi.mock("@/lib/ascendApi", () => api);
vi.mock("@/components/BackButton", () => ({ BackButton: () => <button type="button">Back</button> }));

const workout = {
  title: "Leg day", workoutType: "Strength", durationMinutes: 45,
  exercises: [{ name: "Leg press", sets: 3, reps: "8", load: 80, loadUnit: "kg", needsConfirmation: false }]
};
const active = {
  id: "session-1", clientName: "Alex", startedAt: "2026-11-28T01:00:00.000Z", rawInput: "",
  durationMinutes: 45, workoutDraft: workout, narratives: null
};

describe("trainer session continuity", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    api.getTrainerSessionOverview.mockResolvedValue({
      enabled: true, activeSession: null, previousWorkout: workout,
      recentSessions: [{ clientName: "Alex", narratives: { trainerNextSessionNote: "Start with slow reps." } }]
    });
    api.startTrainerCoachingSession.mockResolvedValue({ session: active });
    api.completeTrainerCoachingSession.mockResolvedValue({ session: { ...active, shareClientRecap: false } });
  });
  afterEach(cleanup);

  it("shows the previous plan immediately and saves edited sets without AI or a shared recap", async () => {
    render(<TrainerSessionCaptureClient clientId="client-1" />);
    expect(await screen.findByText("Start with slow reps.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Repeat last session" }));
    expect(await screen.findByRole("heading", { name: "Today’s session" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Leg press/ }));
    fireEvent.change(screen.getByLabelText("Reps"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Plan for next session"), { target: { value: "Keep the new tempo." } });
    fireEvent.change(screen.getByLabelText("How did the client feel?"), { target: { value: "Strong" } });
    expect(screen.getByRole("checkbox", { name: "Share a recap with the client" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Save session" }));
    await waitFor(() => expect(api.completeTrainerCoachingSession).toHaveBeenCalledWith("client-1", "session-1", expect.objectContaining({
      shareClientRecap: false,
      worksheet: { response: "Strong" },
      narratives: expect.objectContaining({ trainerNextSessionNote: "Keep the new tempo." }),
      draft: expect.objectContaining({ exercises: [expect.objectContaining({ reps: "10" })] })
    })));
    expect(api.interpretTrainerCoachingSession).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "Session saved" })).toBeVisible();
  });

  it("requires a client-facing message before sharing a recap", async () => {
    api.getTrainerSessionOverview.mockResolvedValue({ enabled: true, activeSession: active, previousWorkout: null, recentSessions: [] });
    api.completeTrainerCoachingSession.mockResolvedValue({ session: { ...active, shareClientRecap: true } });
    render(<TrainerSessionCaptureClient clientId="client-1" />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Share a recap with the client" }));
    const save = screen.getByRole("button", { name: "Save & share recap" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Client recap"), { target: { value: "Good tempo today." } });
    fireEvent.click(save);
    await waitFor(() => expect(api.completeTrainerCoachingSession).toHaveBeenCalledWith("client-1", "session-1", expect.objectContaining({
      shareClientRecap: true, narratives: expect.objectContaining({ clientRecap: "Good tempo today." })
    })));
    expect(await screen.findByText("The recap is available to the client.")).toBeVisible();
  });
});
