import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { HealthWorkoutHistory } from "./HealthWorkoutHistory";
import type { DailyActivitySummary } from "@ascend/shared";

const mocks=vi.hoisted(() => ({ history:vi.fn(),adjust:vi.fn(),changed:vi.fn() }));
vi.mock("@/lib/ascendApi",() => ({ getHealthWorkoutHistory:mocks.history,saveHealthManualAdjustment:mocks.adjust }));
const today:DailyActivitySummary={ day:"2026-10-04",timezone:"Asia/Singapore",provider:"apple_health",steps:1000,
  providerActiveCalories:400,manualActiveCalories:0,displayedCalories:400,energyBasis:"active",coverage:"provider_daily",
  workoutCount:1,workoutCountAmbiguous:false,observedAt:"2026-10-04T09:00:00Z",excludedManual:[],manualAdjustments:[],ruleVersion:"daily-active-v1" };
const workout={ externalId:"device-workout",startAt:"2026-10-04T08:00:00Z",endAt:"2026-10-04T09:00:00Z",activityType:"Strength",activeCalories:250,sourceName:"Fixture Watch" };
beforeEach(() => {
  vi.clearAllMocks(); mocks.history.mockResolvedValue({ workouts:[workout],nextCursor:null,timezone:"UTC" });
  mocks.adjust.mockResolvedValue({ saved:true }); mocks.changed.mockResolvedValue(undefined);
});
afterEach(cleanup);
describe("private imported workout history",() => {
  it("uses the saved reporting timezone and identifies energy as estimated",async () => {
    render(<HealthWorkoutHistory today={today} onChanged={mocks.changed} />);
    await screen.findByText("Strength");
    expect(screen.getByText("Reporting timezone: UTC")).toBeInTheDocument();
    expect(screen.getByText(/250 estimated active kcal/)).toBeInTheDocument();
    expect(mocks.history).toHaveBeenCalledWith(today.day);
  });
  it("does not convert missing workout energy into zero",async () => {
    mocks.history.mockResolvedValue({ workouts:[{ ...workout,activeCalories:null }],nextCursor:null,timezone:"UTC" });
    render(<HealthWorkoutHistory today={today} onChanged={mocks.changed} />);
    await screen.findByText("No readable active energy");
    expect(screen.queryByText(/0 estimated active kcal/)).not.toBeInTheDocument();
  });
  it("requires an explicit same-workout confirmation for a late import",async () => {
    render(<HealthWorkoutHistory today={{ ...today,manualAdjustments:[{ id:"manual",label:"My strength session",activeCalories:150 }] }} onChanged={mocks.changed} />);
    const confirm=await screen.findByRole("button",{ name:"Confirm same workout" }); expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox"),{ target:{ value:workout.externalId } });
    expect(mocks.adjust).not.toHaveBeenCalled(); fireEvent.click(confirm);
    await waitFor(() => expect(mocks.adjust).toHaveBeenCalledWith("manual",null,false,workout.externalId));
    expect(mocks.changed).toHaveBeenCalled();
  });
  it("keeps failures distinct from an empty Health result",async () => {
    mocks.history.mockRejectedValue(new Error("Offline"));
    render(<HealthWorkoutHistory today={today} onChanged={mocks.changed} />);
    await screen.findByText(/Could not load imported workouts/);
    expect(screen.queryByText(/No readable workouts for this date/)).not.toBeInTheDocument();
  });
  it("loads additional pages without inventing a workout match",async () => {
    mocks.history.mockResolvedValueOnce({ workouts:[workout],nextCursor:"cursor-1",timezone:"UTC" })
      .mockResolvedValueOnce({ workouts:[{ ...workout,externalId:"second",activityType:"Walking" }],nextCursor:null,timezone:"UTC" });
    render(<HealthWorkoutHistory today={today} onChanged={mocks.changed} />);
    const more=await screen.findByRole("button",{ name:"Load more imported workouts" });
    await waitFor(() => expect(more).toBeEnabled()); fireEvent.click(more);
    await screen.findByText("Walking"); expect(mocks.history).toHaveBeenCalledWith(today.day,"cursor-1");
    expect(mocks.adjust).not.toHaveBeenCalled();
  });
});
