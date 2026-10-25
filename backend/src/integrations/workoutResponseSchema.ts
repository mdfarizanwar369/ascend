// Keep the schema small; exercise suitability and the V2 prescription stay local.
const nullableText = { type: "STRING", nullable: true };

export const workoutResponseSchema: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    intro: { type: "STRING" },
    estimatedDurationMinutes: { type: "INTEGER" },
    focus: { type: "STRING" },
    intensity: { type: "STRING", enum: ["easy", "moderate", "challenging"] },
    warmup: { type: "ARRAY", items: { type: "STRING" }, minItems: 1, maxItems: 4 },
    exercises: {
      type: "ARRAY", minItems: 1, maxItems: 8,
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          sets: { type: "INTEGER", nullable: true },
          reps: { ...nullableText, description: "Use a nonempty prescription here or in duration; null when not applicable." },
          duration: { ...nullableText, description: "Use a nonempty prescription here or in reps; null when not applicable." },
          rest: nullableText,
          note: nullableText
        },
        required: ["name", "sets", "reps", "duration", "rest", "note"]
      }
    },
    cooldown: { type: "ARRAY", items: { type: "STRING" }, minItems: 1, maxItems: 4 },
    coachTip: { type: "STRING" },
    disclaimer: { type: "STRING" }
  },
  required: ["title", "intro", "estimatedDurationMinutes", "focus", "intensity", "warmup", "exercises", "cooldown", "coachTip", "disclaimer"]
};
