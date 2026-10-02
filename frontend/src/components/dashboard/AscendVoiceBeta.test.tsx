import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AscendVoiceBeta } from "./AscendVoiceBeta";

const mocks = vi.hoisted(() => ({
  isAvailable: vi.fn(), listen: vi.fn(), cancel: vi.fn(), stopSpeaking: vi.fn(), playAudio: vi.fn(),
  getVoiceToday: vi.fn(), getVoiceTodayAudio: vi.fn()
}));

vi.mock("@/lib/nativePlatform", () => ({ getNativeCapacitorPlatform: () => "ios" }));
vi.mock("@/lib/ascendVoice", () => ({
  ascendVoice: {
    isAvailable: mocks.isAvailable, listen: mocks.listen, cancel: mocks.cancel,
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

  it("starts the audio request before the text response finishes", async () => {
    let finishText!: (value: { spokenText: string }) => void;
    mocks.getVoiceToday.mockReturnValue(new Promise((resolve) => { finishText = resolve; }));
    render(<AscendVoiceBeta />);
    fireEvent.click(await screen.findByRole("button", { name: "Calories left" }));
    await waitFor(() => expect(mocks.getVoiceTodayAudio).toHaveBeenCalledWith("calories_remaining"));
    expect(mocks.playAudio).not.toHaveBeenCalled();
    finishText({ spokenText: "You have 800 calories left today." });
    await waitFor(() => expect(mocks.playAudio).toHaveBeenCalled());
  });
});
