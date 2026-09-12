import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationSafetyControls, ReportMessageButton } from "./ConversationSafetyControls";
const api = vi.hoisted(() => ({ getConversationSafety: vi.fn(), setConversationBlocked: vi.fn(), reportMessage: vi.fn() }));
vi.mock("@/lib/ascendApi", () => api);

describe("conversation safety controls", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(cleanup);
  it("blocks and unblocks using the server's messaging availability", async () => {
    api.getConversationSafety.mockResolvedValue({ blockedByMe: false, canSend: true });
    api.setConversationBlocked.mockResolvedValueOnce({ blockedByMe: true, canSend: false }).mockResolvedValueOnce({ blockedByMe: false, canSend: false });
    const availability = vi.fn();
    render(<ConversationSafetyControls userId="trainer" onAvailabilityChange={availability} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Block user" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Block user" }));
    await screen.findByRole("button", { name: "Unblock user" });
    expect(api.setConversationBlocked).toHaveBeenCalledWith("trainer", true);
    expect(availability).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Unblock user" }));
    await screen.findByText("Messaging is unavailable for this conversation.");
    expect(api.setConversationBlocked).toHaveBeenLastCalledWith("trainer", false);
    expect(availability).toHaveBeenLastCalledWith(false);
  });
  it("submits a received message with the selected reason and details", async () => {
    api.reportMessage.mockResolvedValue({ report: { id: "report" } });
    render(<ReportMessageButton messageId="message" />);
    fireEvent.click(screen.getByRole("button", { name: "Report message" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "spam" } });
    fireEvent.change(screen.getByLabelText("Additional details (optional)"), { target: { value: "Repeated unwanted links" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await screen.findByText("Report sent to Ascend moderation.");
    expect(api.reportMessage).toHaveBeenCalledWith("message", "spam", "Repeated unwanted links");
  });
  it("does not claim success when reporting fails and permits retry", async () => {
    api.reportMessage.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({ report: { id: "report" } });
    render(<ReportMessageButton messageId="message" />);
    fireEvent.click(screen.getByRole("button", { name: "Report message" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Report sent to Ascend moderation.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await screen.findByText("Report sent to Ascend moderation.");
  });
});
