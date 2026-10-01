import { describe, expect, it } from "vitest";
import { parseVoiceTodayIntent } from "./ascendVoice";

describe("private voice beta questions", () => {
  it.each([
    ["How many calories have I consumed today?", "calories_consumed"],
    ["How many calories do I have left today?", "calories_remaining"],
    ["What is my remaining protein?", "protein_remaining"],
    ["How much water did I drink?", "water_logged"],
    ["How am I doing today?", "today_summary"],
    ["Please change my subscription", null]
  ])("classifies %s", (question, expected) => {
    expect(parseVoiceTodayIntent(question)).toBe(expected);
  });
});
