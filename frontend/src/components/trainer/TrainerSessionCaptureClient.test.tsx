import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainerSessionCaptureClient } from "./TrainerSessionCaptureClient";

const api = vi.hoisted(() => ({
  cancelTrainerCoachingSession: vi.fn(),
  completeTrainerCoachingSession: vi.fn(),
  getTrainerSessionOverview: vi.fn(),
  interpretTrainerCoachingSession: vi.fn(),
  startTrainerCoachingSession: vi.fn(),
  updateTrainerCoachingSession: vi.fn(),
  push: vi.fn()
}));
vi.mock("@/lib/ascendApi", () => api);
vi.mock("@/lib/ptBookingFlag", () => ({ ptBookingEnabled: true }));
vi.mock("@/components/BackButton", () => ({ BackButton: () => <button type="button">Back</button> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: api.push }) }));

const workout = {
  title: "Leg day", workoutType: "Strength", durationMinutes: 45, originalInput: "",
  exercises: [{ name: "Leg press", sets: 3, reps: "8", load: 80, loadUnit: "kg", needsConfirmation: false }]
};
const active = {
  id: "session-1", clientName: "Alex", startedAt: "2026-11-28T01:00:00.000Z", rawInput: "",
  durationMinutes: 45, workoutDraft: workout, narratives: null, version: 1
};

describe("trainer session continuity", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    api.getTrainerSessionOverview.mockResolvedValue({
      enabled: true, activeSession: null, previousWorkout: workout,
      recentSessions: [{ clientName: "Alex", narratives: { trainerNextSessionNote: "Start with slow reps." }, worksheet: { sessionNumber: 2, sessionsPurchased: 10 } }]
    });
    api.startTrainerCoachingSession.mockResolvedValue({ session: active });
    api.completeTrainerCoachingSession.mockResolvedValue({ session: { ...active, shareClientRecap: false } });
  });
  afterEach(cleanup);

  it("shows the previous plan immediately and saves edited sets without AI or a shared recap", async () => {
    render(<TrainerSessionCaptureClient clientId="client-1" />);
    expect(await screen.findByText("Start with slow reps.")).toBeVisible();
    expect(screen.getByText("Session 2 of 10")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Repeat last session" }));
    expect(await screen.findByRole("heading", { name: "Today’s session" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Leg press/ }));
    expect(screen.getByText(/Last session · 3 sets \/ 8 reps \/ 80kg/)).toBeVisible();
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
    expect(screen.getByRole("link", { name: "Book next session" })).toHaveAttribute("href", "/trainer/schedule?clientId=client-1");
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

  it("validates manually entered counts and lets the trainer share just the progress", async () => {
    api.getTrainerSessionOverview.mockResolvedValue({ enabled: true, activeSession: active, previousWorkout: null, recentSessions: [] });
    render(<TrainerSessionCaptureClient clientId="client-1" />);
    fireEvent.change(await screen.findByLabelText("Sessions purchased"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Session number"), { target: { value: "11" } });
    expect(screen.getByText("The session number must be within the package.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save session" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Session number"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Share a recap with the client" }));
    expect(screen.getByText(/Session 3 of 10/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save & share recap" }));
    await waitFor(() => expect(api.completeTrainerCoachingSession).toHaveBeenCalledWith("client-1", "session-1", expect.objectContaining({
      shareClientRecap: true,
      worksheet: { sessionNumber: 3, sessionsPurchased: 10 }
    })));
  });

  it("saves the unfinished worksheet and restores it from the server", async () => {
    api.updateTrainerCoachingSession.mockImplementation(async (_client, _id, input) => {
      api.getTrainerSessionOverview.mockResolvedValue({
        enabled: true, previousWorkout: workout, recentSessions: [],
        activeSession: { ...active, ...input, version: 2 }
      });
      return { session: { ...active, ...input, version: 2 } };
    });
    const view = render(<TrainerSessionCaptureClient clientId="client-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Repeat last session" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use last package total of 10" }));
    expect(screen.getByLabelText("Sessions purchased")).toHaveValue(10);
    expect(screen.getByLabelText("Session number")).toHaveValue(null);
    fireEvent.change(screen.getByLabelText("Session number"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Add exercise" }));
    fireEvent.change(screen.getByLabelText("Plan for next session"), { target: { value: "Check the new setup." } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Share a recap with the client" }));
    expect(screen.getByRole("button", { name: "Save & share recap" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save draft & exit" }));
    await waitFor(() => expect(api.push).toHaveBeenCalledWith("/trainer/clients/client-1?ptDraft=saved"));
    expect(api.updateTrainerCoachingSession).toHaveBeenCalledWith("client-1", "session-1", expect.objectContaining({
      version: 1,
      worksheet: { sessionNumber: 3, sessionsPurchased: 10 },
      narratives: expect.objectContaining({ trainerNextSessionNote: "Check the new setup." }),
      workoutDraft: expect.objectContaining({ exercises: [expect.objectContaining({ name: "Leg press" }), expect.objectContaining({ name: "" })] }),
      shareClientRecap: true
    }));
    expect(api.completeTrainerCoachingSession).not.toHaveBeenCalled();
    view.unmount();
    window.localStorage.setItem("ascend:trainer-session-draft:client-1:session-1", JSON.stringify({ version: 1, rawInput: "Old shorthand", durationMinutes: 20 }));
    render(<TrainerSessionCaptureClient clientId="client-1" />);
    expect(await screen.findByLabelText("Session number")).toHaveValue(3);
    expect(screen.getByText("Draft resumed")).toBeVisible();
    expect(screen.getByLabelText("Plan for next session")).toHaveValue("Check the new setup.");
    expect(screen.getByRole("button", { name: /New exercise/ })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Share a recap with the client" })).toBeChecked();
  });
});
