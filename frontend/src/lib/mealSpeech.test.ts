import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelMealSpeechRecognition,
  getMealSpeechAvailability,
  mealSpeechErrorMessage,
  startMealSpeechRecognition,
  stopMealSpeechRecognition
} from "./mealSpeech";

type FakeRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  abortCount: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function installSpeechRecognition(options: {
  transcripts?: string[];
  error?: string;
  waitForStop?: boolean;
  neverStarts?: boolean;
  neverSettles?: boolean;
  stallOnStop?: boolean;
}) {
  const queued = [...(options.transcripts ?? [])];
  const instances: FakeRecognitionInstance[] = [];

  class FakeRecognition implements FakeRecognitionInstance {
    lang = "";
    continuous = false;
    interimResults = false;
    maxAlternatives = 1;
    onstart: (() => void) | null = null;
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    abortCount = 0;

    constructor() {
      instances.push(this);
    }

    emitResult() {
      const transcript = queued.shift() ?? "";
      const result = Object.assign([{ transcript, confidence: 0.91 }], { isFinal: true });
      this.onresult?.({ resultIndex: 0, results: [result] });
    }

    start() {
      if (options.neverStarts) return;
      queueMicrotask(() => {
        this.onstart?.();
        if (options.waitForStop || options.neverSettles) return;
        if (options.error) this.onerror?.({ error: options.error });
        else this.emitResult();
      });
    }

    stop() {
      if (options.stallOnStop) return;
      queueMicrotask(() => this.emitResult());
    }

    abort() {
      this.abortCount += 1;
      queueMicrotask(() => this.onerror?.({ error: "aborted" }));
    }
  }

  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeRecognition });
  return instances;
}

afterEach(async () => {
  await cancelMealSpeechRecognition();
  vi.useRealTimers();
  Reflect.deleteProperty(window, "SpeechRecognition");
  Reflect.deleteProperty(window, "webkitSpeechRecognition");
});

describe("meal speech recognition", () => {
  it("reports browser availability only when speech recognition exists", async () => {
    expect(await getMealSpeechAvailability()).toEqual({ available: false, source: "none" });
    installSpeechRecognition({ transcripts: ["chicken rice"] });
    expect(await getMealSpeechAvailability()).toEqual({ available: true, source: "browser" });
  });

  it("recognises several natural meal descriptions in consecutive sessions", async () => {
    const instances = installSpeechRecognition({
      transcripts: [
        "chicken rice and iced coffee",
        "nasi lemak with fried chicken and teh tarik kurang manis",
        "two eggs toast and a protein shake"
      ]
    });

    const first = await startMealSpeechRecognition({ locale: "en-MY" });
    const second = await startMealSpeechRecognition({ locale: "en-MY" });
    const third = await startMealSpeechRecognition({ locale: "en-MY" });

    expect(first).toMatchObject({ transcript: "chicken rice and iced coffee", confidence: 0.91, source: "browser" });
    expect(second.transcript).toContain("nasi lemak");
    expect(third.transcript).toBe("two eggs toast and a protein shake");
    expect(instances.map((instance) => instance.abortCount)).toEqual([1, 1, 1]);
  });

  it("lets the user finish listening without creating a second recognition request", async () => {
    const instances = installSpeechRecognition({ transcripts: ["sushi eight pieces and miso soup"], waitForStop: true });
    const pending = startMealSpeechRecognition();
    expect(instances).toHaveLength(1);

    await stopMealSpeechRecognition();

    await expect(pending).resolves.toMatchObject({ transcript: "sushi eight pieces and miso soup" });
    expect(instances).toHaveLength(1);
  });

  it("turns browser permission and no-speech failures into useful guidance", async () => {
    installSpeechRecognition({ error: "not-allowed" });
    await expect(startMealSpeechRecognition()).rejects.toMatchObject({ code: "permission_denied" });
    expect(mealSpeechErrorMessage(Object.assign(new Error("denied"), { code: "permission_denied" }))).toContain("Microphone access is off");

    installSpeechRecognition({ error: "no-speech" });
    await expect(startMealSpeechRecognition()).rejects.toMatchObject({ code: "no_speech" });
    expect(mealSpeechErrorMessage(Object.assign(new Error("silent"), { code: "no_speech" }))).toContain("did not catch");
  });

  it("recovers when microphone access succeeds but the browser never returns a callback", async () => {
    vi.useFakeTimers();
    installSpeechRecognition({ neverSettles: true });

    const pending = startMealSpeechRecognition();
    const rejection = expect(pending).rejects.toMatchObject({ code: "speech_timeout" });
    await vi.advanceTimersByTimeAsync(15_001);

    await rejection;
    expect(mealSpeechErrorMessage(Object.assign(new Error("stalled"), { code: "speech_timeout" }))).toContain("Nothing was saved");

    vi.useRealTimers();
    installSpeechRecognition({ transcripts: ["banana and protein shake"] });
    await expect(startMealSpeechRecognition()).resolves.toMatchObject({ transcript: "banana and protein shake" });
  });

  it("recovers when the browser never reports that recognition started after permission", async () => {
    vi.useFakeTimers();
    installSpeechRecognition({ neverStarts: true });

    const pending = startMealSpeechRecognition();
    const rejection = expect(pending).rejects.toMatchObject({ code: "speech_timeout" });
    await vi.advanceTimersByTimeAsync(20_001);

    await rejection;
  });

  it("recovers when finishing speech produces no result or end event", async () => {
    vi.useFakeTimers();
    installSpeechRecognition({ transcripts: ["chicken rice"], waitForStop: true, stallOnStop: true });

    const pending = startMealSpeechRecognition();
    await vi.runAllTicks();
    await stopMealSpeechRecognition();
    const rejection = expect(pending).rejects.toMatchObject({ code: "speech_timeout" });
    await vi.advanceTimersByTimeAsync(2_501);

    await rejection;
  });
});
