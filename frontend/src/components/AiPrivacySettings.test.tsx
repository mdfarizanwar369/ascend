import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_CONSENT_VERSION, AiConsentStatus } from "@ascend/shared";
import { AiPrivacySettings } from "./AiPrivacySettings";

const mocks = vi.hoisted(() => ({ api: vi.fn(), token: vi.fn(), auth: { currentUser: { uid: "member-one" } } }));
vi.mock("@/lib/api", () => ({ api: mocks.api }));
vi.mock("@/lib/authToken", () => ({ getFirebaseToken: mocks.token }));
vi.mock("@/lib/firebase", () => ({ getFirebaseClientAuth: () => mocks.auth }));
const consent: AiConsentStatus = { version: AI_CONSENT_VERSION, provider: "gemini", providerName: "Google Gemini (Google)", allowed: false, decision: null, updatedAt: null };
beforeEach(() => { mocks.api.mockReset(); mocks.token.mockResolvedValue("test-token"); mocks.auth.currentUser = { uid: "member-one" }; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("AI privacy choices", () => {
  it("keeps the full AI disclosure on iOS without advertising another device platform", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla AscendIOS/5 AscendFree/1 Capacitor");
    const { container } = render(<AiPrivacySettings consent={consent} onChange={vi.fn()} />);
    expect(container.textContent).not.toMatch(/android|health connect|google play/i);
    expect(screen.getByText(/activity imported from connected services/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read the Privacy Policy" })).toHaveAttribute("href", "/privacy/ios");
    expect(screen.getByRole("button", { name: "Allow sharing with Google Gemini (Google)" })).toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("names the recipient and data without saving consent on render", () => {
    render(<AiPrivacySettings consent={consent} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Allow sharing with Google Gemini (Google)" })).toBeInTheDocument();
    expect(screen.getByText(/Food photos and meal descriptions/)).toBeInTheDocument();
    expect(screen.getByText(/Body composition report images/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read the Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("only saves allowance after an explicit click with the displayed provider and version", async () => {
    const onChange = vi.fn();
    mocks.api.mockResolvedValue({ consent: { ...consent, allowed: true, decision: true } });
    render(<AiPrivacySettings consent={consent} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Allow sharing with Google Gemini (Google)" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(JSON.parse(mocks.api.mock.calls[0][1].body)).toEqual({ allowed: true, provider: "gemini", version: AI_CONSENT_VERSION });
  });
  it("supports declining without granting permission", async () => {
    mocks.api.mockResolvedValue({ consent: { ...consent, decision: false } });
    render(<AiPrivacySettings consent={consent} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue without AI" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalled());
    expect(JSON.parse(mocks.api.mock.calls[0][1].body).allowed).toBe(false);
  });
  it("supports revocation and does not claim success if saving fails", async () => {
    const onChange = vi.fn();
    mocks.api.mockRejectedValue(new Error("Connection lost"));
    render(<AiPrivacySettings consent={{ ...consent, allowed: true, decision: true }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn off AI sharing" }));
    await screen.findByText("Connection lost");
    expect(onChange).not.toHaveBeenCalled();
    expect(JSON.parse(mocks.api.mock.calls[0][1].body).allowed).toBe(false);
  });
  it("does not apply one account's screen to a different signed-in account", async () => {
    render(<AiPrivacySettings consent={consent} onChange={vi.fn()} />);
    mocks.auth.currentUser = { uid: "member-two" };
    fireEvent.click(screen.getByRole("button", { name: "Allow sharing with Google Gemini (Google)" }));
    await screen.findByText("Your account changed. Reload this page before choosing.");
    expect(mocks.api).not.toHaveBeenCalled();
  });
});
