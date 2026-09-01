import type {
  AscendCoachClientListItem,
  Client360Access,
  Client360Activity,
  Client360BodyProgress,
  Client360ExerciseProgression,
  Client360Nutrition,
  Client360Profile,
  Client360Section,
  Client360Snapshot,
  Client360Training,
  WorkoutProgressionHistoryItem
} from "@ascend/shared";
import { CLIENT_360_SCHEMA_VERSION } from "@ascend/shared";
import type { AuthUser } from "../middleware/auth";
import {
  buildClient360Signals,
  buildFrequencyTrend,
  buildNutritionPeriod,
  buildWeightChange,
  buildWeightTrend,
  client360DaysBetween
} from "../domain/client360";
import { momentumCalorieTargetRange } from "../domain/momentumV2";
import { bodyCompositionScanFromDb, getTrustedBodyCompositionHistory } from "./bodyCompositionService";
import { buildBodyCompositionComparison } from "./bodyCompositionComparisonService";
import { resolveNutritionTargets } from "./nutritionTargetService";
import { getWorkoutProgressionHistory } from "./workoutProgressionV3Service";
import {
  ASCEND_COACH_DATA_SCOPES,
  AscendCoachAction,
  ascendCoachV1Enabled,
  authorizeAscendCoachActions,
  canUseAscendCoachWorkspace
} from "./ascendCoachPolicyService";
import * as repository from "./client360Repository";

const SECTION_ACTIONS: Record<Client360Section, AscendCoachAction> = {
  profile: "view_profile",
  training: "view_training",
  nutrition: "view_nutrition",
  bodyProgress: "view_body",
  activity: "view_recovery"
};
const SECTION_SCOPES = {
  profile: "profile",
  training: "training",
  nutrition: "nutrition",
  bodyProgress: "body",
  activity: "recovery"
} as const;
const ALL_ACTIONS = Object.values(SECTION_ACTIONS);

export class Client360AccessError extends Error {
  status = 404;
  code = "client_360_not_found";
  constructor() {
    super("Client 360 is not available for this client.");
  }
}

type Dependencies = {
  authorize: typeof authorizeAscendCoachActions;
  canUseWorkspace: typeof canUseAscendCoachWorkspace;
  featureEnabled: typeof ascendCoachV1Enabled;
  repo: typeof repository;
  nutritionTargets: typeof resolveNutritionTargets;
  progressionHistory: typeof getWorkoutProgressionHistory;
};

const defaultDependencies: Dependencies = {
  authorize: authorizeAscendCoachActions,
  canUseWorkspace: canUseAscendCoachWorkspace,
  featureEnabled: ascendCoachV1Enabled,
  repo: repository,
  nutritionTargets: resolveNutritionTargets,
  progressionHistory: getWorkoutProgressionHistory
};

const number = (value: string | number | null | undefined) => value === null || value === undefined ? 0 : Number(value);
const nullableNumber = (value: string | number | null | undefined) => value === null || value === undefined ? null : Number(value);
const rounded = (value: number, decimals = 2) => Number(value.toFixed(decimals));

function compactExerciseProgression(history: WorkoutProgressionHistoryItem[]): Client360ExerciseProgression[] {
  const seen = new Set<string>();
  const items: Client360ExerciseProgression[] = [];
  for (const workout of history) {
    for (const insight of workout.intelligence.exerciseInsights) {
      if (seen.has(insight.exerciseKey)) continue;
      seen.add(insight.exerciseKey);
      items.push({
        exerciseKey: insight.exerciseKey,
        displayName: insight.exerciseName,
        status: insight.status,
        current: insight.current,
        previous: insight.previous,
        lastPerformedAt: workout.completedAt,
        comparableObservationCount: insight.comparableObservationCount,
        confidence: insight.confidence
      });
      if (items.length >= 6) return items;
    }
  }
  return items;
}

function accessFromBatch(batch: Awaited<ReturnType<typeof authorizeAscendCoachActions>>): Client360Access {
  const breakGlass = ALL_ACTIONS.some((action) => Boolean(batch.decisions[action]?.allowed && batch.decisions[action]?.breakGlassGrantId));
  const platformOwner = batch.platformOwnerAccess === true;
  const entries = Object.entries(SECTION_ACTIONS).map(([section, action]) => [section, {
    state: batch.decisions[action]?.allowed ? (breakGlass ? "break_glass" : "granted") : "not_granted",
    requiredScope: SECTION_SCOPES[section as Client360Section]
  }]);
  return {
    mode: platformOwner ? "platform_owner" : breakGlass ? "break_glass" : "relationship",
    relationshipId: breakGlass || platformOwner ? null : batch.relationshipId,
    relationshipStatus: breakGlass || platformOwner ? null : "active",
    authorizationVersion: breakGlass || platformOwner ? null : batch.authorizationVersion,
    sections: Object.fromEntries(entries) as Client360Access["sections"]
  };
}

function buildTraining(
  raw: Awaited<ReturnType<typeof repository.loadClient360Training>>,
  progression: WorkoutProgressionHistoryItem[],
  now: Date
): { training: Client360Training; accountAgeDays: number } {
  const row = raw.aggregate;
  const count30 = number(row?.count_30d);
  // A sliding 56-day window can touch nine calendar weeks. The metric is an
  // eight-week coverage ratio, so it must never exceed its denominator.
  const activeWeeks8 = Math.min(8, number(row?.active_weeks_8));
  const accountAgeDays = row?.client_created_at ? Math.floor(client360DaysBetween(now, new Date(row.client_created_at))) : 0;
  const durationSample = number(row?.duration_count_30d);
  const items = compactExerciseProgression(progression);
  return {
    accountAgeDays,
    training: {
      completedWorkouts: { last7Days: number(row?.count_7d), last30Days: count30, last90Days: number(row?.count_90d) },
      averageSessionsPerWeek30d: rounded(count30 * 7 / 30),
      activeWeeks8,
      loggingConsistency8w: { value: rounded(activeWeeks8 / 8, 3), sampleSize: 8, windowDays: 56, sufficientData: accountAgeDays >= 28 },
      lastWorkoutAt: row?.last_workout_at ?? null,
      averageDurationMinutes30d: { value: durationSample ? rounded(number(row?.average_duration_30d), 1) : null, sampleSize: durationSample, windowDays: 30, sufficientData: durationSample > 0 },
      frequencyTrend: buildFrequencyTrend(number(row?.current_28d), number(row?.previous_28d)),
      recentWorkouts: raw.recent.map((workout) => ({
        id: workout.id,
        completedAt: workout.created_at,
        title: workout.workout_title ?? "Workout",
        workoutType: workout.workout_type,
        durationMinutes: nullableNumber(workout.duration_minutes),
        exerciseCount: number(workout.exercise_count),
        recordedSets: nullableNumber(workout.recorded_sets),
        source: workout.source,
        debriefAvailable: workout.debrief_available
      })),
      exerciseProgression: { identityBasis: "progression_v3_exact_key", items }
    }
  };
}

function buildBody(
  weights: Awaited<ReturnType<typeof repository.loadClient360Weights>>,
  scanRows: Awaited<ReturnType<typeof repository.loadClient360BodyScans>>,
  now: Date
): Client360BodyProgress {
  const weightRecords = weights.map((row) => ({ value: Number(row.weight_kg), recordedAt: row.logged_at }));
  const scans = scanRows.map(bodyCompositionScanFromDb);
  const trusted = getTrustedBodyCompositionHistory(scans);
  const comparison = buildBodyCompositionComparison(trusted.confirmedHistory);
  const latest = trusted.latestConfirmedScan;
  const latestValue = (key: "weightKg" | "bodyFatPercent" | "leanBodyMassKg" | "skeletalMuscleMassKg") => {
    const value = latest?.[key];
    return typeof value === "number" ? value : value === null || value === undefined ? null : Number(value);
  };
  return {
    weight: {
      currentKg: weightRecords[0]?.value ?? null,
      currentRecordedAt: weightRecords[0]?.recordedAt ?? null,
      change7dKg: buildWeightChange(weightRecords, now, 7),
      change30dKg: buildWeightChange(weightRecords, now, 30),
      change90dKg: buildWeightChange(weightRecords, now, 90),
      trend28d: buildWeightTrend(weightRecords, now)
    },
    bodyComposition: {
      scanCount: trusted.confirmedHistory.length,
      latestScanAt: trusted.latestConfirmedScan?.scanDate ?? null,
      previousScanAt: trusted.previousConfirmedScan?.scanDate ?? null,
      evidenceStatus: comparison.status,
      latest: latest ? {
        weightKg: latestValue("weightKg"),
        bodyFatPercent: latestValue("bodyFatPercent"),
        leanBodyMassKg: latestValue("leanBodyMassKg"),
        skeletalMuscleMassKg: latestValue("skeletalMuscleMassKg")
      } : null,
      establishedChanges: comparison.metrics
        .filter((entry) => entry.evidenceStatus === "ESTABLISHED" && ["higher", "lower", "no_clear_change"].includes(entry.signal))
        .map((entry) => ({ metric: entry.metric, change: entry.change ?? 0, signal: entry.signal as "higher" | "lower" | "no_clear_change" }))
    }
  };
}

export function createAscendCoachClient360Service(dependencies: Dependencies = defaultDependencies) {
  return {
    async getSnapshot(actor: AuthUser, clientId: string, now = new Date()): Promise<Client360Snapshot> {
      const batch = await dependencies.authorize(actor, clientId, ALL_ACTIONS);
      const isBreakGlass = ALL_ACTIONS.some((action) => Boolean(batch.decisions[action]?.allowed && batch.decisions[action]?.breakGlassGrantId));
      const isPlatformOwnerAccess = batch.platformOwnerAccess === true;
      if (!isBreakGlass && !isPlatformOwnerAccess && batch.relationshipStatus !== "active") throw new Client360AccessError();
      if (!ALL_ACTIONS.some((action) => batch.decisions[action]?.allowed)) throw new Client360AccessError();

      const allowed = (section: Client360Section) => batch.decisions[SECTION_ACTIONS[section]]?.allowed === true;
      const profilePromise = allowed("profile") ? dependencies.repo.loadClient360Profile(clientId) : Promise.resolve(null);
      const trainingPromise = allowed("training") ? Promise.all([
        dependencies.repo.loadClient360Training(clientId),
        dependencies.progressionHistory(clientId, 10)
      ]) : Promise.resolve(null);
      const nutritionPromise = allowed("nutrition") ? Promise.all([
        dependencies.repo.loadClient360NutritionDays(clientId),
        dependencies.nutritionTargets(clientId, {
          includeBodyComposition: allowed("bodyProgress"),
          includeWeightHistory: allowed("bodyProgress")
        })
      ]) : Promise.resolve(null);
      const bodyPromise = allowed("bodyProgress") ? Promise.all([
        dependencies.repo.loadClient360Weights(clientId),
        dependencies.repo.loadClient360BodyScans(clientId)
      ]) : Promise.resolve(null);
      const activityPromise = allowed("activity") ? dependencies.repo.loadClient360Activity(clientId) : Promise.resolve(null);
      const [profileRow, trainingRaw, nutritionRaw, bodyRaw, activityRaw] = await Promise.all([
        profilePromise, trainingPromise, nutritionPromise, bodyPromise, activityPromise
      ]);

      if (allowed("profile") && !profileRow) throw new Client360AccessError();
      const profile: Client360Profile | undefined = profileRow ? {
        displayName: profileRow.full_name,
        goal: profileRow.goal_type,
        activityLevel: profileRow.activity_level
      } : undefined;
      const builtTraining = trainingRaw ? buildTraining(trainingRaw[0], trainingRaw[1], now) : null;
      const training = builtTraining?.training;
      const goal = profile?.goal ?? null;
      let nutrition: Client360Nutrition | undefined;
      let latestNutritionLogAt: string | null | undefined;
      if (nutritionRaw) {
        const [days, targets] = nutritionRaw;
        const loggedDays = days.filter((day): day is typeof day & { logged_date: string } => Boolean(day.logged_date));
        const dayMap = new Map(loggedDays.map((day) => [day.logged_date.slice(0, 10), { calories: number(day.calories), proteinG: number(day.protein_g) }]));
        const denseDays = Array.from({ length: 30 }, (_, index) => {
          const date = new Date(now);
          date.setUTCHours(0, 0, 0, 0);
          date.setUTCDate(date.getUTCDate() - index);
          const key = date.toISOString().slice(0, 10);
          return { date: key, calories: dayMap.get(key)?.calories ?? 0, proteinG: dayMap.get(key)?.proteinG ?? 0 };
        });
        const range = momentumCalorieTargetRange(days[0]?.goal_type ?? goal);
        nutrition = {
          targets: { calories: targets.calories, proteinG: targets.proteinG, source: targets.source, calorieRangeRatio: range },
          last7Days: buildNutritionPeriod(denseDays, 7, targets.calories, targets.proteinG, range),
          last30Days: buildNutritionPeriod(denseDays, 30, targets.calories, targets.proteinG, range),
          targetEvaluationBasis: "logged_days_only"
        };
        latestNutritionLogAt = loggedDays[0]?.logged_date ?? null;
      }
      const bodyProgress = bodyRaw ? buildBody(bodyRaw[0], bodyRaw[1], now) : undefined;
      const activity: Client360Activity | undefined = activityRaw ? {
        connected: activityRaw.connected,
        lastSyncedAt: activityRaw.last_synced_at,
        todaySteps: nullableNumber(activityRaw.today_steps),
        averageSteps7d: {
          value: nullableNumber(activityRaw.average_steps_7d),
          sampleSize: number(activityRaw.steps_days_7d),
          windowDays: 7,
          sufficientData: number(activityRaw.steps_days_7d) > 0
        },
        exerciseSessions7d: number(activityRaw.exercise_sessions_7d),
        lastExerciseSessionAt: activityRaw.last_exercise_session_at
      } : undefined;
      const accountAgeDays = profileRow?.created_at
        ? Math.floor(client360DaysBetween(now, new Date(profileRow.created_at)))
        : builtTraining?.accountAgeDays ?? 0;
      const generatedAt = now.toISOString();
      return {
        version: CLIENT_360_SCHEMA_VERSION,
        clientId,
        generatedAt,
        access: accessFromBatch(batch),
        ...(profile ? { profile } : {}),
        ...(training ? { training } : {}),
        ...(nutrition ? { nutrition } : {}),
        ...(bodyProgress ? { bodyProgress } : {}),
        ...(activity ? { activity } : {}),
        coachingSignals: buildClient360Signals({ now, accountAgeDays, goal, training, nutrition7d: nutrition?.last7Days, body: bodyProgress }),
        freshness: {
          generatedAt,
          ...(allowed("training") ? { latestWorkoutAt: training?.lastWorkoutAt ?? null } : {}),
          ...(allowed("nutrition") ? { latestNutritionLogAt: latestNutritionLogAt ?? null } : {}),
          ...(allowed("bodyProgress") ? { latestWeightAt: bodyProgress?.weight.currentRecordedAt ?? null, latestScanAt: bodyProgress?.bodyComposition.latestScanAt ?? null } : {}),
          ...(allowed("activity") ? { activityLastSyncedAt: activity?.lastSyncedAt ?? null } : {})
        }
      };
    },

    async listClients(actor: AuthUser): Promise<AscendCoachClientListItem[]> {
      if (!dependencies.featureEnabled()) throw new Client360AccessError();
      if (actor.isPlatformOwner) {
        const clients = await dependencies.repo.loadAllPlatformOwnerClients();
        await dependencies.repo.auditPlatformOwnerClientList(actor.id, clients.length);
        return clients.map((client) => ({
          clientId: client.id,
          accessMode: "platform_owner",
          relationshipId: null,
          relationshipStatus: null,
          authorizationVersion: null,
          grantedScopes: [...ASCEND_COACH_DATA_SCOPES],
          displayName: client.full_name,
          goal: client.goal_type,
          lastWorkoutAt: client.last_workout_at
        }));
      }
      const canUseTrainerWorkspace = await dependencies.canUseWorkspace(actor);
      if (!actor.trainerId || !canUseTrainerWorkspace) throw new Client360AccessError();
      const relationships = await dependencies.repo.loadActiveClient360Relationships(actor.trainerId);
      const profileIds = relationships.filter((row) => row.data_scopes.includes("profile")).map((row) => row.client_id);
      const trainingIds = relationships.filter((row) => row.data_scopes.includes("training")).map((row) => row.client_id);
      const [profiles, workouts] = await Promise.all([
        dependencies.repo.loadClient360ListProfiles(profileIds),
        dependencies.repo.loadClient360ListWorkoutDates(trainingIds)
      ]);
      const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
      const workoutMap = new Map(workouts.map((workout) => [workout.id, workout.last_workout_at]));
      return relationships.map((relationship) => {
        const profile = profileMap.get(relationship.client_id);
        return {
          clientId: relationship.client_id,
          accessMode: "relationship",
          relationshipId: relationship.relationship_id,
          relationshipStatus: "active",
          authorizationVersion: number(relationship.authorization_version),
          grantedScopes: relationship.data_scopes,
          ...(profile ? { displayName: profile.full_name, goal: profile.goal_type } : {}),
          ...(relationship.data_scopes.includes("training") ? { lastWorkoutAt: workoutMap.get(relationship.client_id) ?? null } : {})
        };
      });
    }
  };
}

export const ascendCoachClient360Service = createAscendCoachClient360Service();
