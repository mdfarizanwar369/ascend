export type BeginnerProgrammeStage = "foundation" | "consistency" | "progress";
export type BeginnerProgrammeSetup = {
  location: "gym" | "home" | "hotel" | "outdoors";
  timeAvailable: "20" | "30" | "45" | "60";
  goal: "fat_loss" | "muscle_gain" | "strength" | "general_fitness" | "recovery" | "mobility";
  equipment: string;
};

export type BeginnerProgrammeSummary = {
  id: string;
  status: "active" | "paused" | "ended";
  completedSessions: number;
  nextSessionNumber: number;
  stage: BeginnerProgrammeStage;
  stageLabel: string;
  nextSessionKind: "A" | "B";
  note: string;
  lastSetup: BeginnerProgrammeSetup | null;
  anchorExercises: string[];
  lastCompletedAt: string | null;
};

export type BeginnerProgrammePrescription = {
  programmeId: string;
  sessionNumber: number;
  sessionKind: "A" | "B";
  stage: BeginnerProgrammeStage;
  stageLabel: string;
  note: string;
  coreExerciseIndexes: number[];
  supplementary: boolean;
};
