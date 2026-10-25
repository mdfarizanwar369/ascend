import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientDashboard } from "./ClientDashboard";

const mocks = vi.hoisted(() => ({
  api: Object.fromEntries([
    "acknowledgeGoalMilestone", "clearAscendResponseCache", "completeMission", "getAscendMemory",
    "getBurnLogs", "getCoachPresence", "getComplianceToday", "getTodayRecoveryCheckin", "getHabitLogs",
    "getHabits", "getAthleteDashboard", "getFoodLogs", "getHealthSyncStatus", "getLatestRecognition",
    "getMe", "getMyNutritionTargets", "getMyProgressComparison", "getGoalStatus", "getMyStreak",
    "getProgressPhotos", "getTodayMission", "getTodayPriorityRecommendation", "getTodayWorkout",
    "getWaterLogs", "getWeightLogs", "saveRecoveryCheckin"
  ].map((name) => [name, vi.fn()])),
  cachedProfile: vi.fn(),
  cacheProfile: vi.fn(),
  loadPlan: vi.fn(),
  pendingRecord: vi.fn(),
  clearRecord: vi.fn()
}));

vi.mock("@/lib/ascendApi", () => mocks.api);
vi.mock("@/lib/accountSession", () => ({
  getCachedAccountProfile: mocks.cachedProfile,
  cacheAccountProfile: mocks.cacheProfile,
  loadAccountPlan: mocks.loadPlan
}));
vi.mock("@/lib/firebase", () => ({
  getFirebaseClientAuth: () => ({ currentUser: { uid: "fictional-owner" } }),
  waitForFirebasePersistence: () => Promise.resolve()
}));
vi.mock("@/lib/dataSync", () => ({
  DASHBOARD_RECORD_EVENT: "ascend:test-dashboard-record",
  clearDashboardRecord: mocks.clearRecord,
  readDashboardRecord: mocks.pendingRecord,
  readRecentDashboardAction: () => null
}));
vi.mock("@/lib/workoutSessionDraft", () => ({ readWorkoutSessionDraft: () => null }));
vi.mock("@/lib/dashboardPanelLaunch", () => ({ consumeDashboardPanelLaunch: () => null }));
vi.mock("@/lib/todayEssentialsLaunch", () => ({ claimTodayEssentialsColdLaunch: () => false }));
vi.mock("@/lib/appEdition", () => ({ isIosFreeEdition: () => false }));
vi.mock("@/components/AccountBar", () => ({ AccountBar: () => <div>Account controls</div> }));
vi.mock("@/components/BrandMark", () => ({ BrandMark: () => <span>Ascend mark</span> }));
vi.mock("@/components/ThemeToggle", () => ({ ThemeToggle: () => <button>Change theme</button> }));
vi.mock("@/components/ExperienceVisuals", () => ({ ZoeAvatar: () => <span>Coach avatar</span> }));
vi.mock("@/components/dashboard/AscendRiseMomentum", () => ({ AscendRiseMomentum: () => null }));
vi.mock("@/components/dashboard/TodayWorkoutCard", () => ({ TodayWorkoutCard: () => <section aria-label="Today's workout" /> }));
vi.mock("@/components/dashboard/AppleHealthInvitation", () => ({
  AppleHealthInvitation: () => null,
  AppleHealthReminder: () => null,
  useAppleHealthInvitation: () => ({ state: null, postpone: vi.fn() })
}));
vi.mock("@/components/dashboard/AscendLaunchMorphV22", () => ({
  useAscendLaunchMorphV22: () => ({ enabled: false, holdingLaunchGlyph: false, startDashboardMorph: () => false }),
  getAscendMorphV22Timing: () => ({ cardDelayMs: 0, ringDelayMs: 0, contentDelayMs: 0, contactPulseDelayMs: 0 })
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const todayTimestamp = new Date(2026, 9, 25, 10).toISOString();
const owner = {
  id: "fictional-owner", email: "owner@example.test", full_name: "Test Owner", is_platform_owner: true,
  coaching_mode: "self_coached", goal_type: "maintenance", gender: "female", age_years: 30,
  height_cm: 170, starting_weight_kg: 80, target_weight_kg: 80, activity_level: "moderate"
};
const food = {
  id: "food-1", logged_at: todayTimestamp, food_name: "Fictional lunch", calories: 650,
  protein_g: 45, carbs_g: 70, fat_g: 21
};
const targets = { calories: 2500, proteinG: 150, carbsG: 300, fatG: 80, source: "coach_plan", sourceLabel: "Trainer plan" };
const health = {
  provider: "health_connect", connected: true, permissions: [], timezone: "Asia/Singapore",
  lastSyncedAt: todayTimestamp,
  summary: { connected: true, todaySteps: 4800, averageSteps7d: 4000, todayActiveCalories: 0,
    workoutsThisWeek: 0, workoutCompletedToday: false, latestWorkoutAt: null, lastSyncedAt: todayTimestamp }
};

function holdSupportingRequests() {
  const mission = deferred<{ mission: null }>();
  const recognition = deferred<{ recognition: null }>();
  const compliance = deferred<{ compliance: { score: number } }>();
  mocks.api.getTodayMission.mockReturnValue(mission.promise);
  mocks.api.getLatestRecognition.mockReturnValue(recognition.promise);
  mocks.api.getComplianceToday.mockReturnValue(compliance.promise);
  return async () => {
    await act(async () => {
      mission.resolve({ mission: null });
      recognition.resolve({ recognition: null });
      compliance.resolve({ compliance: { score: 50 } });
    });
  };
}

function expectCorrectEssentials() {
  expect(screen.getByRole("link", { name: "1,850 kcal left. Open food log." })).toHaveAttribute("href", "/food-log");
  expect(screen.getByText("650 of 2,500 kcal logged today")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Fuel: 1 meal/ })).toHaveAttribute("href", "/food-log");
  expect(screen.getByRole("link", { name: /Move: 4,800 steps/ })).toHaveAttribute("href", "/burn-log");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 25, 12));
  vi.stubEnv("NEXT_PUBLIC_DASHBOARD_ESSENTIALS_PUBLIC", "false");
  vi.stubEnv("NEXT_PUBLIC_DASHBOARD_ESSENTIALS_OWNER_PILOT", "true");
  Object.values(mocks.api).forEach((mock) => mock.mockReset());
  mocks.cachedProfile.mockReset().mockReturnValue(null);
  mocks.cacheProfile.mockReset();
  mocks.loadPlan.mockReset().mockResolvedValue("free");
  mocks.pendingRecord.mockReset().mockReturnValue(null);
  mocks.clearRecord.mockReset();
  const responses: Record<string, unknown> = {
    getMe: { user: owner, roles: ["owner"] },
    getFoodLogs: { foodLogs: [food] }, getWeightLogs: { weightLogs: [] },
    getWaterLogs: { waterLogs: [{ id: "water-1", amount_ml: 1250, logged_at: todayTimestamp }] },
    getBurnLogs: { burnLogs: [] }, getHabits: { habits: [] }, getHabitLogs: { habitLogs: [] },
    getComplianceToday: { compliance: { score: 50 } }, getTodayMission: { mission: null },
    getLatestRecognition: { recognition: null }, getMyStreak: { streak: { current: 1, best: 1, checkedInToday: true } },
    getGoalStatus: { goalStatus: null }, getProgressPhotos: { progressPhotos: [] },
    getMyNutritionTargets: { targets }, getCoachPresence: { latest: null, history: [], settings: { style: "balanced", paused: false, pauseUntil: null } },
    getAscendMemory: null, getHealthSyncStatus: { status: health },
    getTodayRecoveryCheckin: { checkin: { sleep_quality: "good" } }, getTodayPriorityRecommendation: null,
    getMyProgressComparison: null, getTodayWorkout: { dailyWorkout: null }
  };
  Object.entries(responses).forEach(([name, response]) => mocks.api[name].mockResolvedValue(response));
});

describe("public dashboard essentials loading", () => {
  const client = { ...owner, id: "fictional-client", email: "client@example.test", full_name: "Test Client", is_platform_owner: false };

  it("waits for fresh identity and a coherent daily snapshot before replacing a cached client profile", async () => {
    vi.stubEnv("NEXT_PUBLIC_DASHBOARD_ESSENTIALS_PUBLIC", "true");
    mocks.cachedProfile.mockReturnValue({ email: client.email, fullName: client.full_name, roles: ["client"], isPlatformOwner: false });
    const freshMe = deferred<{ user: typeof client; roles: string[] }>();
    const freshTargets = deferred<{ targets: typeof targets }>();
    const freshHealth = deferred<{ status: typeof health }>();
    mocks.api.getMe.mockReturnValueOnce(freshMe.promise);
    mocks.api.getMyNutritionTargets.mockReturnValueOnce(freshTargets.promise);
    mocks.api.getHealthSyncStatus.mockReturnValueOnce(freshHealth.promise);
    const releaseSupporting = holdSupportingRequests();
    render(<ClientDashboard />);
    await act(async () => {});
    expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "loading");
    expect(screen.getByText("Loading your dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /kcal left\. Open food log/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Move: No log yet/ })).not.toBeInTheDocument();
    await act(async () => freshMe.resolve({ user: client, roles: ["client"] }));
    expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "loading");
    expect(screen.queryByRole("link", { name: /kcal left\. Open food log/ })).not.toBeInTheDocument();
    await act(async () => freshTargets.resolve({ targets }));
    expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "loading");
    expect(screen.queryByRole("link", { name: /Move: No log yet/ })).not.toBeInTheDocument();
    await act(async () => freshHealth.resolve({ status: health }));
    await waitFor(() => expectCorrectEssentials());
    expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "ready");
    expect(screen.getByLabelText("Loading supporting insights")).toBeInTheDocument();
    expect(mocks.cacheProfile).toHaveBeenCalledWith(expect.objectContaining({ email: client.email, isPlatformOwner: false }));
    await releaseSupporting();
    await waitFor(() => expect(screen.queryByLabelText("Loading supporting insights")).not.toBeInTheDocument());
    expectCorrectEssentials();
    for (const name of ["getMe", "getFoodLogs", "getWaterLogs", "getMyNutritionTargets", "getHealthSyncStatus"]) {
      expect(mocks.api[name]).toHaveBeenCalledOnce();
    }
  });

  it.each([
    ["a client", client, ["client"]],
    ["an owner", owner, ["owner"]]
  ])("loads essentials early for %s when the owner pilot flag is disabled", async (_label, user, roles) => {
    vi.stubEnv("NEXT_PUBLIC_DASHBOARD_ESSENTIALS_PUBLIC", "true");
    vi.stubEnv("NEXT_PUBLIC_DASHBOARD_ESSENTIALS_OWNER_PILOT", "false");
    mocks.api.getMe.mockResolvedValue({ user, roles });
    const releaseSupporting = holdSupportingRequests();
    render(<ClientDashboard />);
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "ready"));
    expectCorrectEssentials();
    expect(screen.getByLabelText("Loading supporting insights")).toBeInTheDocument();
    await releaseSupporting();
    expectCorrectEssentials();
  });

  it("provides a working retry after fresh client identity fails instead of showing cached totals", async () => {
    vi.stubEnv("NEXT_PUBLIC_DASHBOARD_ESSENTIALS_PUBLIC", "true");
    mocks.cachedProfile.mockReturnValue({ email: client.email, fullName: client.full_name, roles: ["client"], isPlatformOwner: false });
    mocks.api.getMe.mockRejectedValueOnce(new Error("Synthetic identity unavailable"));
    mocks.api.getMe.mockResolvedValue({ user: client, roles: ["client"] });
    render(<ClientDashboard />);
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "error"));
    expect(screen.getByText("Synthetic identity unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /kcal left\. Open food log/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Move: No log yet/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry dashboard" }));
    await waitFor(() => expectCorrectEssentials());
    expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "ready");
    expect(mocks.api.getMe).toHaveBeenCalledTimes(2);
    expect(mocks.api.getFoodLogs).toHaveBeenCalledTimes(2);
  });

  it("keeps a public client's new-day view unloaded until yesterday's in-flight response is discarded", async () => {
    vi.stubEnv("NEXT_PUBLIC_DASHBOARD_ESSENTIALS_PUBLIC", "true");
    vi.stubEnv("NEXT_PUBLIC_DASHBOARD_ESSENTIALS_OWNER_PILOT", "false");
    mocks.api.getMe.mockResolvedValue({ user: client, roles: ["client"] });
    render(<ClientDashboard />);
    await waitFor(() => expectCorrectEssentials());
    const yesterdayFoods = deferred<{ foodLogs: typeof food[] }>();
    const nextDayFoods = deferred<{ foodLogs: typeof food[] }>();
    mocks.api.getFoodLogs.mockReturnValueOnce(yesterdayFoods.promise).mockReturnValueOnce(nextDayFoods.promise);
    await act(async () => window.dispatchEvent(new Event("ascend:health-updated")));
    vi.setSystemTime(new Date(2026, 9, 26, 0, 1));
    await act(async () => window.dispatchEvent(new Event("pageshow")));
    expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "loading");
    expect(screen.queryByRole("link", { name: /kcal left\. Open food log/ })).not.toBeInTheDocument();
    await act(async () => yesterdayFoods.resolve({ foodLogs: [food] }));
    await waitFor(() => expect(mocks.api.getFoodLogs).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "loading");
    expect(screen.queryByRole("link", { name: /kcal left\. Open food log/ })).not.toBeInTheDocument();
    const nextDayFood = { ...food, id: "food-public-next-day", calories: 900, logged_at: new Date(2026, 9, 26, 0, 0).toISOString() };
    await act(async () => nextDayFoods.resolve({ foodLogs: [nextDayFood] }));
    await waitFor(() => expect(screen.getByRole("link", { name: "1,600 kcal left. Open food log." })).toBeInTheDocument());
    expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "ready");
    expect(screen.queryByText("650 of 2,500 kcal logged today")).not.toBeInTheDocument();
    expect(screen.getByText("900 of 2,500 kcal logged today")).toBeInTheDocument();
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("owner dashboard essentials loading", () => {
  it("makes complete, accurate essentials usable while optional insights are still pending", async () => {
    const releaseSupporting = holdSupportingRequests();
    render(<ClientDashboard />);
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "ready"));
    expectCorrectEssentials();
    expect(screen.getByLabelText("Loading supporting insights")).toBeInTheDocument();
    expect(screen.queryByText("Loading your dashboard")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Recover:.*Open recovery options/ }));
    const recovery = screen.getByRole("dialog", { name: "Recovery check-in" });
    expect(within(recovery).getByText("1.3L recorded today")).toBeInTheDocument();
    expect(within(recovery).getByRole("button", { name: "good" })).toHaveAttribute("aria-pressed", "true");
    await releaseSupporting();
    await waitFor(() => expect(screen.queryByLabelText("Loading supporting insights")).not.toBeInTheDocument());
    expectCorrectEssentials();
    for (const name of ["getMe", "getFoodLogs", "getWaterLogs", "getMyNutritionTargets", "getHealthSyncStatus"]) {
      expect(mocks.api[name]).toHaveBeenCalledOnce();
    }
  });

  it("does not briefly show a fallback calorie allowance while trainer targets are pending", async () => {
    const nutrition = deferred<{ targets: typeof targets }>();
    mocks.api.getMyNutritionTargets.mockReturnValue(nutrition.promise);
    render(<ClientDashboard />);
    await act(async () => {});
    expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "loading");
    expect(screen.getByText("Loading your dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /kcal left\. Open food log/ })).not.toBeInTheDocument();
    await act(async () => nutrition.resolve({ targets }));
    await waitFor(() => expectCorrectEssentials());
  });

  it("does not portray missing Apple Health response as zero movement", async () => {
    const syncedHealth = deferred<{ status: typeof health }>();
    mocks.api.getHealthSyncStatus.mockReturnValue(syncedHealth.promise);
    render(<ClientDashboard />);
    await act(async () => {});
    expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "loading");
    expect(screen.queryByRole("link", { name: /Move: No log yet/ })).not.toBeInTheDocument();
    await act(async () => syncedHealth.resolve({ status: health }));
    await waitFor(() => expect(screen.getByRole("link", { name: /Move: 4,800 steps/ })).toBeInTheDocument());
  });

  it("waits for recovery state rather than asking for a check-in already completed", async () => {
    const recovery = deferred<{ checkin: { sleep_quality: string } }>();
    mocks.api.getTodayRecoveryCheckin.mockReturnValue(recovery.promise);
    render(<ClientDashboard />);
    await act(async () => {});
    expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "loading");
    expect(screen.queryByText("No water or sleep check-in yet")).not.toBeInTheDocument();
    await act(async () => recovery.resolve({ checkin: { sleep_quality: "good" } }));
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "ready"));
    const recoveryButton = screen.getByRole("button", { name: /Recover:.*Open recovery options/ });
    expect(within(recoveryButton).getByText(/good sleep/)).toBeInTheDocument();
  });

  it.each([
    ["a public user with cached owner roles", "true", false, ["owner"]],
    ["an owner with the feature flag disabled", "false", true, ["owner"]]
  ])("retains existing request grouping for %s", async (_label, flag, freshOwner, cachedRoles) => {
    vi.stubEnv("NEXT_PUBLIC_DASHBOARD_ESSENTIALS_OWNER_PILOT", flag);
    mocks.cachedProfile.mockReturnValue({ email: "cached@example.test", fullName: "Cached Owner", roles: cachedRoles, isPlatformOwner: true });
    mocks.api.getMe.mockResolvedValue({ user: { ...owner, is_platform_owner: freshOwner }, roles: freshOwner ? ["owner"] : ["client"] });
    const releaseSupporting = holdSupportingRequests();
    render(<ClientDashboard />);
    await act(async () => {});
    expect(screen.getByRole("main")).not.toHaveAttribute("data-dashboard-state", "ready");
    expect(screen.queryByRole("link", { name: "1,850 kcal left. Open food log." })).not.toBeInTheDocument();
    await releaseSupporting();
    await waitFor(() => expect(screen.getByRole("link", { name: "1,850 kcal left. Open food log." })).toBeInTheDocument());
  });

  it("does not use cached owner roles to unlock the pilot before fresh identity resolves", async () => {
    mocks.cachedProfile.mockReturnValue({ email: owner.email, fullName: owner.full_name, roles: ["owner"] });
    const me = deferred<{ user: typeof owner; roles: string[] }>();
    mocks.api.getMe.mockReturnValue(me.promise);
    const releaseSupporting = holdSupportingRequests();
    render(<ClientDashboard />);
    await act(async () => {});
    expect(screen.queryByRole("link", { name: "1,850 kcal left. Open food log." })).not.toBeInTheDocument();
    await act(async () => me.resolve({ user: owner, roles: ["owner"] }));
    await waitFor(() => expectCorrectEssentials());
    await releaseSupporting();
  });

  it("round-trips the cached owner marker without showing a provisional dashboard on return", async () => {
    const firstVisit = render(<ClientDashboard />);
    await waitFor(() => expectCorrectEssentials());
    expect(mocks.cacheProfile).toHaveBeenCalledWith(expect.objectContaining({
      email: owner.email, fullName: owner.full_name, isPlatformOwner: true
    }));
    const cachedOwner = mocks.cacheProfile.mock.calls.at(-1)?.[0];
    firstVisit.unmount();
    mocks.cachedProfile.mockReturnValue(cachedOwner);
    const freshMe = deferred<{ user: typeof owner; roles: string[] }>();
    const freshTargets = deferred<{ targets: typeof targets }>();
    mocks.api.getMe.mockReturnValueOnce(freshMe.promise);
    mocks.api.getMyNutritionTargets.mockReturnValueOnce(freshTargets.promise);
    const releaseSupporting = holdSupportingRequests();
    render(<ClientDashboard />);
    await act(async () => {});
    expect(screen.getByText("Loading your dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /kcal left\. Open food log/ })).not.toBeInTheDocument();
    await act(async () => freshMe.resolve({ user: owner, roles: ["owner"] }));
    expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "loading");
    expect(screen.getByText("Loading your dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /kcal left\. Open food log/ })).not.toBeInTheDocument();
    await act(async () => freshTargets.resolve({ targets }));
    await waitFor(() => expectCorrectEssentials());
    expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "ready");
    expect(mocks.api.getMe).toHaveBeenCalledTimes(2);
    expect(mocks.api.getMyNutritionTargets).toHaveBeenCalledTimes(2);
    await releaseSupporting();
  });

  it.each(["getMyNutritionTargets", "getHealthSyncStatus"])("shows unknown totals after initial %s failure and retries exactly once", async (failedRead) => {
    mocks.api[failedRead].mockRejectedValueOnce(new Error("Synthetic unavailable response"));
    render(<ClientDashboard />);
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "error"));
    expect(screen.getByText("Your dashboard could not refresh. Please try again.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /kcal left\. Open food log/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Move: No log yet/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Recover:.*Open recovery options/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry dashboard" }));
    await waitFor(() => expectCorrectEssentials());
    expect(screen.getByRole("main")).toHaveAttribute("data-dashboard-state", "ready");
    expect(mocks.api.getMe).toHaveBeenCalledTimes(2);
    expect(mocks.api[failedRead]).toHaveBeenCalledTimes(2);
  });

  it("keeps a consistent last-good snapshot when a later refresh partially fails", async () => {
    render(<ClientDashboard />);
    await waitFor(() => expectCorrectEssentials());
    mocks.api.getFoodLogs.mockResolvedValue({ foodLogs: [{ ...food, calories: 900 }] });
    mocks.api.getHealthSyncStatus.mockRejectedValueOnce(new Error("Synthetic refresh failure"));
    await act(async () => window.dispatchEvent(new Event("ascend:health-updated")));
    await waitFor(() => expect(screen.getByText("Your dashboard could not refresh. Please try again.")).toBeInTheDocument());
    expectCorrectEssentials();
    expect(screen.queryByText("900 of 2,500 kcal logged today")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry dashboard" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "1,600 kcal left. Open food log." })).toBeInTheDocument());
    expect(screen.getByText("900 of 2,500 kcal logged today")).toBeInTheDocument();
    expect(mocks.api.getFoodLogs).toHaveBeenCalledTimes(3);
  });

  it("can refresh essentials again while the first request's supporting insights remain pending", async () => {
    const releaseSupporting = holdSupportingRequests();
    render(<ClientDashboard />);
    await waitFor(() => expectCorrectEssentials());
    mocks.api.getFoodLogs.mockResolvedValue({ foodLogs: [{ ...food, calories: 900 }] });
    await act(async () => window.dispatchEvent(new Event("ascend:health-updated")));
    await waitFor(() => expect(screen.getByRole("link", { name: "1,600 kcal left. Open food log." })).toBeInTheDocument());
    expect(mocks.api.getFoodLogs).toHaveBeenCalledTimes(2);
    await releaseSupporting();
    expect(screen.getByText("900 of 2,500 kcal logged today")).toBeInTheDocument();
  });

  it("queues a confirmed food write behind an older read and retains it until the server includes it", async () => {
    render(<ClientDashboard />);
    await waitFor(() => expectCorrectEssentials());
    const oldFoods = deferred<{ foodLogs: typeof food[] }>();
    mocks.api.getFoodLogs.mockReturnValueOnce(oldFoods.promise);
    await act(async () => window.dispatchEvent(new Event("ascend:health-updated")));
    const confirmedFood = { ...food, id: "confirmed-food-2", food_name: "Fictional snack", calories: 250 };
    mocks.pendingRecord.mockImplementation((kind: string) => kind === "food" ? confirmedFood : null);
    await act(async () => window.dispatchEvent(new Event("ascend:test-dashboard-record")));
    await act(async () => oldFoods.resolve({ foodLogs: [food] }));
    await waitFor(() => expect(screen.getByRole("link", { name: "1,600 kcal left. Open food log." })).toBeInTheDocument());
    expect(screen.getByText("900 of 2,500 kcal logged today")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Fuel: 2 meals/ })).toBeInTheDocument();
    expect(mocks.api.getFoodLogs).toHaveBeenCalledTimes(3);
    expect(mocks.clearRecord).not.toHaveBeenCalledWith("food", confirmedFood.id);
    mocks.api.getFoodLogs.mockResolvedValue({ foodLogs: [confirmedFood, food] });
    await act(async () => window.dispatchEvent(new Event("ascend:health-updated")));
    await waitFor(() => expect(mocks.clearRecord).toHaveBeenCalledWith("food", confirmedFood.id));
    expect(screen.getByText("900 of 2,500 kcal logged today")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Fuel: 2 meals/ })).toBeInTheDocument();
  });

  it("discards yesterday's delayed response after midnight and loads the new day's essentials", async () => {
    const yesterdayFoods = deferred<{ foodLogs: typeof food[] }>();
    mocks.api.getFoodLogs.mockReturnValueOnce(yesterdayFoods.promise);
    render(<ClientDashboard />);
    await act(async () => {});
    vi.setSystemTime(new Date(2026, 9, 26, 0, 1));
    const nextDayFood = { ...food, id: "food-next-day", calories: 900, logged_at: new Date(2026, 9, 26, 0, 0).toISOString() };
    mocks.api.getFoodLogs.mockResolvedValue({ foodLogs: [nextDayFood] });
    await act(async () => window.dispatchEvent(new Event("pageshow")));
    await act(async () => yesterdayFoods.resolve({ foodLogs: [food] }));
    await waitFor(() => expect(screen.getByRole("link", { name: "1,600 kcal left. Open food log." })).toBeInTheDocument());
    expect(screen.queryByText("650 of 2,500 kcal logged today")).not.toBeInTheDocument();
    expect(mocks.api.getFoodLogs).toHaveBeenCalledTimes(2);
  });

  it("ignores a fresh identity response that arrives after the dashboard has unmounted", async () => {
    const me = deferred<{ user: typeof owner; roles: string[] }>();
    mocks.api.getMe.mockReturnValue(me.promise);
    const view = render(<ClientDashboard />);
    view.unmount();
    await act(async () => me.resolve({ user: owner, roles: ["owner"] }));
    expect(mocks.cacheProfile).not.toHaveBeenCalled();
  });
});
