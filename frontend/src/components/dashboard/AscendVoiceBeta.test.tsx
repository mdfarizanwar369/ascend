import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AscendVoiceBeta } from "./AscendVoiceBeta";

const mocks = vi.hoisted(() => ({
  isAvailable: vi.fn(), listen: vi.fn(), stopListening: vi.fn(), addListener: vi.fn(), cancel: vi.fn(), stopSpeaking: vi.fn(), playAudio: vi.fn(),
  getVoiceToday: vi.fn(), getVoiceTodayAudio: vi.fn()
}));

vi.mock("@/lib/nativePlatform", () => ({ getNativeCapacitorPlatform: () => "ios" }));
vi.mock("@/lib/ascendVoice", () => ({
  ascendVoice: {
    isAvailable: mocks.isAvailable, listen: mocks.listen, stopListening: mocks.stopListening, addListener: mocks.addListener, cancel: mocks.cancel,
    stopSpeaking: mocks.stopSpeaking, playAudio: mocks.playAudio
  },
  parseVoiceTodayIntent: () => "calories_remaining"
}));
vi.mock("@/lib/ascendApi", () => ({
  getVoiceToday: mocks.getVoiceToday,
  getVoiceTodayAudio: mocks.getVoiceTodayAudio
}));

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.isAvailable.mockResolvedValue({ available: false, naturalAudioAvailable: true });
  mocks.stopSpeaking.mockResolvedValue(undefined);
  mocks.cancel.mockResolvedValue(undefined);
  mocks.listen.mockResolvedValue({ transcript: "How many calories are left?" });
  mocks.stopListening.mockResolvedValue(undefined);
  mocks.addListener.mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) });
  mocks.getVoiceToday.mockResolvedValue({ spokenText: "You have 800 calories left today." });
  mocks.getVoiceTodayAudio.mockResolvedValue({ spokenText: "You have 800 calories left today.", audioBase64: "UklGRg==" });
  mocks.playAudio.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); });

describe("private Ascend Voice controls", () => {
  it("lets the user request microphone access even when the early availability check says false", async () => {
    render(<AscendVoiceBeta />);
    const button = await screen.findByRole("button", { name: "Ask Ascend" });
    await waitFor(() => expect(mocks.isAvailable).toHaveBeenCalled());
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(mocks.listen).toHaveBeenCalledWith({ locale: "en-US" }));
    await waitFor(() => expect(mocks.playAudio).toHaveBeenCalledWith({ audioBase64: "UklGRg==" }));
    expect(mocks.getVoiceToday).toHaveBeenCalledWith("calories_remaining");
    expect(mocks.getVoiceTodayAudio).toHaveBeenCalledWith("calories_remaining");
  });

  it("starts speaking even if the separate text response is still pending", async () => {
    let finishText!: (value: { spokenText: string }) => void;
    mocks.getVoiceToday.mockReturnValue(new Promise((resolve) => { finishText = resolve; }));
    render(<AscendVoiceBeta />);
    fireEvent.click(await screen.findByRole("button", { name: "Calories left" }));
    await waitFor(() => expect(mocks.getVoiceTodayAudio).toHaveBeenCalledWith("calories_remaining"));
    await waitFor(() => expect(mocks.playAudio).toHaveBeenCalledWith({ audioBase64: "UklGRg==" }));
    expect(screen.getByText(/Voice started in .*s/)).toBeInTheDocument();
    finishText({ spokenText: "You have 800 calories left today." });
    expect(screen.getByText("You have 800 calories left today.")).toBeInTheDocument();
  });

  it("answers the captured question when the user taps Stop listening", async () => {
    let finishListening!: (value: { transcript: string }) => void;
    mocks.listen.mockReturnValue(new Promise((resolve) => { finishListening = resolve; }));
    render(<AscendVoiceBeta />);
    fireEvent.click(await screen.findByRole("button", { name: "Ask Ascend" }));
    await screen.findByRole("button", { name: "Stop listening" });
    await waitFor(() => expect(mocks.addListener).toHaveBeenCalledWith("partialTranscript", expect.any(Function)));
    act(() => { mocks.addListener.mock.calls[0][1]({ transcript: "How many calories" }); });
    expect(screen.getByText("Heard: How many calories")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop listening" }));
    await waitFor(() => expect(mocks.stopListening).toHaveBeenCalledTimes(1));
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.getVoiceTodayAudio).not.toHaveBeenCalled();
    finishListening({ transcript: "How many calories are left today?" });
    await waitFor(() => expect(mocks.playAudio).toHaveBeenCalled());
    expect(screen.getByText(/Heard: How many calories are left today/)).toBeInTheDocument();
  });

  it("shows an error if stopping yields no recognized words", async () => {
    let failListening!: (error: Error) => void;
    mocks.listen.mockReturnValue(new Promise((_resolve, reject) => { failListening = reject; }));
    render(<AscendVoiceBeta />);
    fireEvent.click(await screen.findByRole("button", { name: "Ask Ascend" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop listening" }));
    await waitFor(() => expect(mocks.stopListening).toHaveBeenCalledTimes(1));
    failListening(new Error("I didn't hear a question. Please try again."));
    expect(await screen.findByRole("alert")).toHaveTextContent("I didn't hear a question");
  });
});
