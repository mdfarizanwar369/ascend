export const challengeTemplates = ["meals", "hydration", "movement"] as const;
export type ChallengeTemplate = typeof challengeTemplates[number];
export type ChallengeAudience = "trainer" | "gym";
export type ChallengeRole = ChallengeAudience | "member";
export type ChallengeStatus = "draft" | "upcoming" | "live" | "finished";

export type ChallengeRules = {
  title: string;
  template: ChallengeTemplate;
  actions: ChallengeTemplate[];
  requiredActions: number;
  startsOn: string;
  endsOn: string;
  goalDays: number;
  leaderboard: boolean;
};

export type MonthlyChallenge = ChallengeRules & {
  id: string;
  gymId: string;
  audience: ChallengeAudience;
  organizer: string;
  gymName: string;
  timeZone: string;
  status: ChallengeStatus;
  version: number;
  joined: boolean;
};

export type ChallengeList = {
  gyms: Array<{ id: string; name: string; timeZone: string }>;
  challenges: MonthlyChallenge[];
};

export type ChallengeDetail = {
  challenge: MonthlyChallenge;
  today: string;
  joinedCount: number;
  completedCount: number;
  leaderboard: Array<{ rank: number; name: string; score: number; isMe: boolean }>;
  membership: null | {
    score: number;
    todayActions: ChallengeTemplate[];
    mealLogAvailable: boolean;
    displayName: string | null;
    waterTargetMl: number | null;
  };
};
