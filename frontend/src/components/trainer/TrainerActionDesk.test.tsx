import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainerActionDesk } from "./TrainerActionDesk";

const api = vi.hoisted(() => ({
  getMe: vi.fn(),
  getMySubscription: vi.fn(),
  getTrainerClients: vi.fn(),
  getTrainerRiskAlerts: vi.fn(),
  getTrainerWorkQueueDispositions: vi.fn(),
  getTrainerOnboardingStatus: vi.fn(),
  putTrainerWorkQueueDisposition: vi.fn(),
  updateTrainerRiskAlert: vi.fn(),
  sendTrainerClientPraise: vi.fn(),
  createTrainerReferralCode: vi.fn()
}));

vi.mock("@/lib/ascendApi", () => api);
vi.mock("@/components/trainer/TrainerClientInsights", () => ({ TrainerClientInsightsPanel: ({ clientId }: { clientId: string }) => <div data-testid="existing-graph">Graph for {clientId}</div> }));

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  api.getMe.mockResolvedValue({ roles: ["trainer"], user: { trainer_status: "active" } });
  api.getTrainerClients.mockResolvedValue({ clients: [
    { id: "urgent", full_name: "Daniel Lee", email: "daniel@example.com", current_plan: "premium", risk_severity: "high", open_alerts: 1, unread_messages: 1 },
    { id: "message", full_name: "Priya Nair", email: "priya@example.com", current_plan: "premium", compliance_score: 90, unread_messages: 2 },
    { id: "win", full_name: "Maya Chen", email: "maya@example.com", current_plan: "premium", compliance_score: 90, goal_achieved_at: "2026-10-12T00:00:00Z", unread_messages: 0 }
  ] });
  api.getTrainerRiskAlerts.mockResolvedValue({ alerts: [{ id: "risk-1", user_id: "urgent", severity: "high", message: "Review the alert" }] });
  api.getTrainerWorkQueueDispositions.mockResolvedValue({ dispositions: [] });
  api.getTrainerOnboardingStatus.mockResolvedValue({ onboarding: { referral_code: "TRAINER" } });
  api.getMySubscription.mockResolvedValue({ subscription: { status: "active" } });
  api.putTrainerWorkQueueDisposition.mockResolvedValue({ disposition: { client_user_id: "urgent", kind: "followup", signal_key: "alert:risk-1", disposition: "snoozed", suppress_until: "2099-01-01T00:00:00Z" } });
} );

describe("trainer action desk", () => {
  it("shows a compact work queue, searches clients, and opens the existing graph", async () => {
    render(<TrainerActionDesk />);
    await screen.findByText(/Review the alert/);
    expect(screen.getByText("2 clients need you · 3 assigned")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Clients" }));
    expect(screen.queryByText("Daniel Lee")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search client name" }), { target: { value: "maya" } });
    expect(screen.getByText("Maya Chen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Graph" }));
    expect(screen.getByTestId("existing-graph")).toHaveTextContent("Graph for win");
  });

  it("snoozes an alert for this trainer and removes it from today's queue", async () => {
    render(<TrainerActionDesk />);
    await screen.findByText(/Review the alert/);
    fireEvent.click(screen.getByText(/Review the alert/).closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: /Remind tomorrow/ }));
    await waitFor(() => expect(api.putTrainerWorkQueueDisposition).toHaveBeenCalledWith("urgent", { kind: "followup", signalKey: "alert:risk-1", disposition: "snoozed" }));
    await waitFor(() => expect(screen.getByText("Nothing to handle in this group right now.")).toBeInTheDocument());
  });
});
