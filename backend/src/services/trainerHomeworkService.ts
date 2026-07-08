import { query } from "../db/pool";
import { env } from "../config/env";
import { buildWorkoutMemorySummary } from "./workoutMemoryService";
import { buildWorkoutPlannerContext } from "./workoutPlannerPersonalizationService";
import { getHealthSyncSummary } from "./healthSyncService";
import { persistCompletedWorkout, resolveWorkoutWeightKg } from "./workoutCompletionService";
import { sendNotificationToUser } from "./notificationService";
import { createTrainerHomeworkPlan } from "../integrations/openai";

export type TrainerHomeworkStatus = "assigned" | "completed" | "missed";

export type TrainerHomeworkWorkout = {
  title: string;
  intro: string;
  estimatedDurationMinutes: number;
  focus: string;
  intensity: "easy" | "moderate" | "challenging";
  warmup: string[];
  exercises: Array<{
    name: string;
    sets?: number | null;
    reps?: string | null;
    duration?: string | null;
    rest?: string | null;
    note?: string | null;
  }>;
  cooldown: string[];
  coachTip: string;
  disclaimer: string;
  whyItFits: string;
};

type TrainerHomeworkGenerationInput = {
  clientId: string;
  trainerName: string;
  location: string;
  timeAvailable: "20" | "30" | "45" | "60";
  goal: string;
  equipment: string[];
  assignmentDate: string;
  dueDate: string;
  coachNote?: string | null;
};

type TrainerHomeworkAssignmentInput = TrainerHomeworkGenerationInput & {
  assignedByUserId: string;
  trainerId?: string | null;
  workout: TrainerHomeworkWorkout;
};
type PersistedTrainerHomeworkAssignmentInput = Omit<TrainerHomeworkAssignmentInput, "trainerName">;

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function equipmentLabel(equipment: unknown) {
  if (Array.isArray(equipment)) {
    return equipment.filter((item) => typeof item === "string" && item.trim()).join(", ");
  }
  return typeof equipment === "string" ? equipment : "";
}

function parseEquipment(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function localDateString(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

function homeworkHref(assignmentId: string) {
  return `/coach-homework/${assignmentId}`;
}

function homeworkDedupeKey(prefix: string, assignmentId: string, dayKey: string) {
  return `${prefix}:${assignmentId}:${dayKey}`;
}

function assignmentDateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

function statusCompletionPercent(status: TrainerHomeworkStatus) {
  return status === "completed" ? 100 : 0;
}

function parseWorkoutJson(value: unknown): TrainerHomeworkWorkout | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const exercises = Array.isArray(source.exercises)
    ? source.exercises
        .map((exercise) => {
          const item = exercise && typeof exercise === "object" ? (exercise as Record<string, unknown>) : {};
          const name = asText(item.name);
          if (!name) return null;
          return {
            name,
            sets: typeof item.sets === "number" ? item.sets : null,
            reps: asText(item.reps),
            duration: asText(item.duration),
            rest: asText(item.rest),
            note: asText(item.note)
          };
        })
        .filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise))
    : [];
  return {
    title: asText(source.title) ?? "Coach Homework",
    intro: asText(source.intro) ?? "Generated following your coach's instructions.",
    estimatedDurationMinutes: asNumber(source.estimatedDurationMinutes) ?? 30,
    focus: asText(source.focus) ?? "General fitness",
    intensity: source.intensity === "easy" || source.intensity === "challenging" ? source.intensity : "moderate",
    warmup: Array.isArray(source.warmup) ? source.warmup.map((item) => String(item)).slice(0, 5) : [],
    exercises,
    cooldown: Array.isArray(source.cooldown) ? source.cooldown.map((item) => String(item)).slice(0, 5) : [],
    coachTip: asText(source.coachTip) ?? "Move with control and follow your coach's focus.",
    disclaimer: asText(source.disclaimer) ?? "Adjust the workout to your experience level and stop if you experience pain.",
    whyItFits: asText(source.whyItFits) ?? "It matches your coach's focus, your recent activity, and your current profile."
  };
}

export function trainerHomeworkEnabled() {
  return env.TRAINER_HOMEWORK_V1;
}

export async function refreshHomeworkStatuses(clientId?: string) {
  if (!trainerHomeworkEnabled()) return;
  const params: Array<string> = [];
  let whereClause = "status = 'assigned' and due_date < current_date";
  if (clientId) {
    params.push(clientId);
    whereClause += ` and client_id = $${params.length}`;
  }
  await query(
    `
    update trainer_homework_assignments
    set status = 'missed', updated_at = now()
    where ${whereClause}
    `,
    params
  );
}

export async function generateTrainerHomeworkPreview(input: TrainerHomeworkGenerationInput) {
  const [profileResult, recentFoodResult, recentBurnResult, athleteResult, bodyScanResult, recentMessagesResult, healthSyncSummary, momentumResult, latestWeightKg] =
    await Promise.all([
      query(
        `
        select goal_type, starting_weight_kg, target_weight_kg, activity_level, age_years, gender, height_cm
        from users
        where id = $1
        `,
        [input.clientId]
      ),
      query(
        `
        select count(*)::int as logs_7d,
          count(distinct logged_at::date)::int as food_days_7d,
          coalesce(round(avg(protein_g)::numeric, 1), 0) as avg_protein_g,
          max(logged_at) as latest_food_at
        from food_logs
        where user_id = $1
          and logged_at >= now() - interval '7 days'
        `,
        [input.clientId]
      ),
      query(
        `
        select metadata, created_at
        from analytics_events
        where user_id = $1
          and event_name = 'burn_log'
        order by created_at desc
        limit 5
        `,
        [input.clientId]
      ),
      query(
        `
        select enabled, sport, division, competition_name, competition_date, goal_weight_kg
        from athlete_profiles
        where user_id = $1
        `,
        [input.clientId]
      ),
      query(
        `
        select scan_date, weight_kg, body_fat_percent, skeletal_muscle_mass_kg, visceral_fat, bmr_kcal
        from body_composition_scans
        where user_id = $1
          and user_confirmed = true
        order by scan_date desc, created_at desc
        limit 1
        `,
        [input.clientId]
      ),
      query(
        `
        select role, message
        from ai_chat_messages
        where user_id = $1
        order by created_at desc
        limit 4
        `,
        [input.clientId]
      ),
      getHealthSyncSummary(input.clientId),
      query(
        `
        select score
        from compliance_scores
        where user_id = $1
        order by calculated_for_date desc
        limit 1
        `,
        [input.clientId]
      ),
      resolveWorkoutWeightKg(input.clientId)
    ]);

  const workoutMemory = buildWorkoutMemorySummary(recentBurnResult.rows, {
    currentMomentum: Number(momentumResult.rows[0]?.score ?? 0) || null
  });

  const promptContext = JSON.stringify(
    buildWorkoutPlannerContext({
      coachAccess: { tier: "trainer_pro", premiumDepth: true },
      profile: profileResult.rows[0] ?? null,
      latestWeightKg,
      recentFoodConsistency: recentFoodResult.rows[0] ?? null,
      recentWorkouts: recentBurnResult.rows,
      workoutMemory,
      athleteMode: athleteResult.rows[0] ?? null,
      latestBodyScan: bodyScanResult.rows[0] ?? null,
      recentCoachZoeContext: recentMessagesResult.rows.reverse(),
      healthSync: healthSyncSummary
        ? {
            todaySteps: healthSyncSummary.todaySteps,
            averageSteps7d: healthSyncSummary.averageSteps7d,
            todayActiveCalories: healthSyncSummary.todayActiveCalories,
            workoutsThisWeek: healthSyncSummary.workoutsThisWeek,
            workoutCompletedToday: healthSyncSummary.workoutCompletedToday,
            lastSyncedAt: healthSyncSummary.lastSyncedAt
          }
        : null,
      request: {
        location: input.location,
        timeAvailable: input.timeAvailable,
        goal: input.goal,
        equipment: input.equipment.join(", ")
      }
    })
  );

  const workout = await createTrainerHomeworkPlan({
    trainerName: input.trainerName,
    location: input.location,
    timeAvailable: input.timeAvailable,
    goal: input.goal,
    equipment: input.equipment,
    assignmentDate: input.assignmentDate,
    dueDate: input.dueDate,
    coachNote: input.coachNote ?? null,
    context: promptContext
  });

  return { workout };
}

export async function assignTrainerHomework(input: PersistedTrainerHomeworkAssignmentInput) {
  const inserted = await query<{ id: string }>(
    `
    insert into trainer_homework_assignments (
      trainer_id,
      assigned_by_user_id,
      client_id,
      workout_json,
      title,
      goal,
      location,
      equipment,
      duration_minutes,
      intensity,
      coach_note,
      assignment_date,
      due_date,
      status
    )
    values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,'assigned')
    returning *
    `,
    [
      input.trainerId ?? null,
      input.assignedByUserId,
      input.clientId,
      JSON.stringify(input.workout),
      input.workout.title,
      input.goal,
      input.location,
      JSON.stringify(input.equipment),
      input.workout.estimatedDurationMinutes,
      input.workout.intensity,
      input.coachNote ?? null,
      input.assignmentDate,
      input.dueDate
    ]
  );

  const assignmentResult = await query(
    `
    select tha.*, assigned_by.full_name as trainer_name
    from trainer_homework_assignments tha
    join users assigned_by on assigned_by.id = tha.assigned_by_user_id
    where tha.id = $1
    limit 1
    `,
    [inserted.rows[0]?.id]
  );

  return assignmentResult.rows[0] ? mapHomeworkRow(assignmentResult.rows[0]) : null;
}

function mapHomeworkRow(row: Record<string, unknown>) {
  const workout = parseWorkoutJson(row.workout_json);
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    assigned_by_user_id: String(row.assigned_by_user_id),
    trainer_name: asText(row.trainer_name),
    title: asText(row.title) ?? "Coach Homework",
    goal: asText(row.goal) ?? "General fitness",
    location: asText(row.location) ?? "Home",
    equipment: parseEquipment(row.equipment),
    duration_minutes: asNumber(row.duration_minutes) ?? 0,
    intensity: asText(row.intensity) ?? "moderate",
    coach_note: asText(row.coach_note),
    assignment_date: String(row.assignment_date),
    due_date: String(row.due_date),
    status: (asText(row.status) ?? "assigned") as TrainerHomeworkStatus,
    assigned_at: String(row.assigned_at),
    completed_at: row.completed_at ? String(row.completed_at) : null,
    completion_percent: statusCompletionPercent((asText(row.status) ?? "assigned") as TrainerHomeworkStatus),
    workout
  };
}

export async function getTrainerHomeworkHistory(clientId: string) {
  await refreshHomeworkStatuses(clientId);
  const result = await query(
    `
    select tha.*, assigned_by.full_name as trainer_name
    from trainer_homework_assignments tha
    join users assigned_by on assigned_by.id = tha.assigned_by_user_id
    where tha.client_id = $1
    order by tha.assignment_date desc, tha.created_at desc
    limit 20
    `,
    [clientId]
  );
  return result.rows.map(mapHomeworkRow);
}

export async function getCurrentClientHomework(clientId: string) {
  await refreshHomeworkStatuses(clientId);
  const result = await query(
    `
    select tha.*, assigned_by.full_name as trainer_name
    from trainer_homework_assignments tha
    join users assigned_by on assigned_by.id = tha.assigned_by_user_id
    where tha.client_id = $1
      and tha.status = 'assigned'
    order by tha.assignment_date asc, tha.created_at desc
    limit 1
    `,
    [clientId]
  );
  return result.rows[0] ? mapHomeworkRow(result.rows[0]) : null;
}

export async function getClientHomeworkById(clientId: string, assignmentId: string) {
  await refreshHomeworkStatuses(clientId);
  const result = await query(
    `
    select tha.*, assigned_by.full_name as trainer_name
    from trainer_homework_assignments tha
    join users assigned_by on assigned_by.id = tha.assigned_by_user_id
    where tha.id = $1
      and tha.client_id = $2
    limit 1
    `,
    [assignmentId, clientId]
  );
  return result.rows[0] ? mapHomeworkRow(result.rows[0]) : null;
}

export async function notifyHomeworkAssigned(input: { assignmentId: string; userId: string; trainerName: string; assignmentDate: string }) {
  return sendNotificationToUser(input.userId, {
    type: "trainer_mission",
    priority: 1,
    title: "Coach Homework assigned",
    body: `${input.trainerName} assigned you homework for ${assignmentDateLabel(input.assignmentDate)}.`,
    href: homeworkHref(input.assignmentId),
    tag: "ascend-homework",
    dedupeKey: homeworkDedupeKey("coach-homework-assigned", input.assignmentId, input.assignmentDate)
  });
}

export async function notifyHomeworkDue(input: { assignmentId: string; userId: string; trainerName: string; dueDate: string }) {
  return sendNotificationToUser(input.userId, {
    type: "trainer_mission",
    priority: 1,
    title: "Coach Homework due today",
    body: `${input.trainerName}'s homework is due today.`,
    href: homeworkHref(input.assignmentId),
    tag: "ascend-homework",
    dedupeKey: homeworkDedupeKey("coach-homework-due", input.assignmentId, input.dueDate)
  });
}

export async function notifyHomeworkCompleted(input: { assignmentId: string; trainerUserId: string; clientName: string; completedDate: string }) {
  return sendNotificationToUser(input.trainerUserId, {
    type: "trainer_message",
    priority: 1,
    title: "Homework completed",
    body: `${input.clientName} completed today's homework.`,
    href: "/trainer",
    tag: "ascend-homework-completed",
    dedupeKey: homeworkDedupeKey("coach-homework-completed", input.assignmentId, input.completedDate)
  });
}

export async function sendHomeworkDueNotifications(limit = 100) {
  if (!trainerHomeworkEnabled()) return { sent: 0, checked: 0 };
  await refreshHomeworkStatuses();
  const result = await query(
    `
    select tha.id, tha.client_id, tha.due_date, assigned_by.full_name as trainer_name
    from trainer_homework_assignments tha
    join users assigned_by on assigned_by.id = tha.assigned_by_user_id
    where tha.status = 'assigned'
      and tha.due_date = current_date
    order by tha.created_at desc
    limit $1
    `,
    [limit]
  );
  let sent = 0;
  for (const row of result.rows) {
    const response = await notifyHomeworkDue({
      assignmentId: String(row.id),
      userId: String(row.client_id),
      trainerName: asText(row.trainer_name) ?? "Your coach",
      dueDate: String(row.due_date)
    });
    sent += response.sent;
  }
  return { sent, checked: result.rows.length };
}

export async function completeTrainerHomework(input: {
  assignmentId: string;
  clientId: string;
  completedAt: string;
}) {
  await refreshHomeworkStatuses(input.clientId);
  const assignmentResult = await query(
    `
    select tha.*, assigned_by.full_name as trainer_name, client_user.full_name as client_name
    from trainer_homework_assignments tha
    join users assigned_by on assigned_by.id = tha.assigned_by_user_id
    join users client_user on client_user.id = tha.client_id
    where tha.id = $1
      and tha.client_id = $2
      and tha.status = 'assigned'
    limit 1
    `,
    [input.assignmentId, input.clientId]
  );
  const assignment = assignmentResult.rows[0];
  if (!assignment) return null;
  const workout = parseWorkoutJson(assignment.workout_json);
  if (!workout) throw new Error("Homework workout is unavailable.");

  const clientGymResult = await query<{ gym_id: string | null }>("select gym_id from users where id = $1 limit 1", [input.clientId]);
  const completion = await persistCompletedWorkout({
    userId: input.clientId,
    gymId: clientGymResult.rows[0]?.gym_id ?? null,
    workoutCompletionKey: `trainer-homework:${input.assignmentId}`,
    workoutTitle: workout.title,
    workoutType: workout.focus,
    workoutDifficulty: workout.intensity,
    durationMinutes: workout.estimatedDurationMinutes,
    completedAt: input.completedAt,
    exercises: workout.exercises,
    healthProviderCaloriesBurned: null,
    source: "coach_homework",
    extraMetadata: {
      trainerHomeworkAssignmentId: input.assignmentId,
      trainerHomeworkAssignedDate: assignment.assignment_date,
      trainerHomeworkDueDate: assignment.due_date,
      trainerHomeworkCoachNote: assignment.coach_note,
      trainerHomeworkTrainerName: assignment.trainer_name
    }
  });

  await query(
    `
    update trainer_homework_assignments
    set status = 'completed',
        completed_at = $2,
        completed_burn_log_id = $3,
        updated_at = now()
    where id = $1
    `,
    [input.assignmentId, input.completedAt, completion.burnLog.id]
  );

  await notifyHomeworkCompleted({
    assignmentId: input.assignmentId,
    trainerUserId: String(assignment.assigned_by_user_id),
    clientName: asText(assignment.client_name) ?? "Your client",
    completedDate: localDateString(input.completedAt)
  }).catch(() => ({ sent: 0, skipped: true }));

  return completion;
}
