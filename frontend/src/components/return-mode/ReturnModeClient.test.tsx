import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replace, prefetch, claim, continued } = vi.hoisted(() => ({
  replace: vi.fn(),
  prefetch: vi.fn(),
  claim: vi.fn(),
  continued: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, prefetch })
}));

vi.mock("@/lib/ascendApi", () => ({
  claimReturnMode: claim,
  continueReturnMode: continued
}));

import { ReturnModeClient, ReturnModeView } from "./ReturnModeClient";
import { writeReturnModeHandoff } from "@/lib/returnMode";

describe("Return Mode UI", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    replace.mockReset();
    prefetch.mockReset();
    claim.mockReset();
    continued.mockReset().mockResolvedValue({ recorded: true });
    vi.stubEnv("NEXT_PUBLIC_RETURN_MODE_V1", "true");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("uses the approved message with a first name", () => {
    render(<ReturnModeView firstName="Fariz" onContinue={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Good to have you back, Fariz." })).toBeInTheDocument();
    expect(screen.getByText("Your progress is still here. We’ll continue from today—at your pace.")).toBeInTheDocument();
  });

  it("uses the approved fallback without a name", () => {
    render(<ReturnModeView onContinue={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Good to have you back." })).toBeInTheDocument();
  });

  it("wraps long and Unicode names without truncating their accessible text", () => {
    const longName = "李李李李李李李李李李李李李李李李李李李李";
    render(<ReturnModeView firstName={longName} onContinue={() => undefined} />);
    expect(screen.getByRole("heading", { name: `Good to have you back, ${longName}.` })).toBeInTheDocument();
  });

  it("continues to the normal dashboard from an authoritative launch handoff", async () => {
    writeReturnModeHandoff("Fariz Anwar");
    render(<ReturnModeClient />);

    const button = await screen.findByRole("button", { name: "See today" });
    expect(button).toHaveFocus();
    fireEvent.click(button);

    expect(replace).toHaveBeenCalledWith("/dashboard");
    expect(continued).toHaveBeenCalledOnce();
    expect(claim).not.toHaveBeenCalled();
  });

  it("can resolve a direct route through the authoritative server claim", async () => {
    claim.mockResolvedValue({ returnMode: { claimed: true, fullName: "Fariz Anwar" } });
    render(<ReturnModeClient />);

    expect(await screen.findByRole("heading", { name: "Good to have you back, Fariz." })).toBeInTheDocument();
    expect(claim).toHaveBeenCalledOnce();
  });

  it("does not submit the continue action twice", async () => {
    writeReturnModeHandoff("Fariz Anwar");
    render(<ReturnModeClient />);

    const button = await screen.findByRole("button", { name: "See today" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(continued).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("returns to Today when a direct route is no longer eligible", async () => {
    claim.mockResolvedValue({ returnMode: { claimed: false } });
    render(<ReturnModeClient />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByText(/Good to have you back/)).not.toBeInTheDocument();
  });

  it("falls back safely when eligibility cannot be claimed", async () => {
    claim.mockRejectedValue(new Error("offline"));
    render(<ReturnModeClient />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByText(/Good to have you back/)).not.toBeInTheDocument();
  });

  it("bypasses the feature when its flag is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_RETURN_MODE_V1", "false");
    render(<ReturnModeClient />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(claim).not.toHaveBeenCalled();
  });
});
