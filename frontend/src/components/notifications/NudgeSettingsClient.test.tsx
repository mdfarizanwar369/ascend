import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defaultNudgePreferences, nudgeCategories } from "@ascend/shared";
import { NudgeSettingsClient } from "./NudgeSettingsClient";
const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), permission: vi.fn(), enable: vi.fn() }));
vi.mock("@/lib/ascendApi", () => ({ getSmartNudgePreferences: mocks.get, saveSmartNudgePreferences: mocks.save }));
vi.mock("@/lib/coachNotifications", () => ({ coachNotificationPermission: mocks.permission, enableCoachNotifications: mocks.enable }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.get.mockResolvedValue({ available: true, categories: nudgeCategories, version: 0, preferences: defaultNudgePreferences() });
  mocks.permission.mockResolvedValue("prompt"); mocks.enable.mockResolvedValue("fake-token");
  mocks.save.mockImplementation(async preferences => ({ preferences, version: 1, available: true, categories: nudgeCategories }));
});
afterEach(cleanup);
async function openSetup() {
  render(<NudgeSettingsClient />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Use recommended setup" })).toBeEnabled());
}
function customise() { fireEvent.click(screen.getByRole("button", { name: /Customise/ })); }
it("offers a recommended draft without enabling anything or exposing time inputs", async () => {
  await openSetup();
  expect(screen.getByRole("button", { name: "Daily essentials, recommended" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Breakfast, lunch & dinner")).toBeVisible();
  expect(screen.getByText(/Up to 4 a day/)).toBeVisible();
  expect(document.querySelector('input[type="time"]')).toBeNull();
  expect(mocks.enable).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.getByRole("link", {name: "Not now"})).toHaveAttribute("href", "/profile");
});
it("enables three meals, water and scheduled workouts with one explicit action", async () => {
  await openSetup(); fireEvent.click(screen.getByRole("button", {name: "Use recommended setup"}));
  await screen.findByText(/Preferences saved/);
  expect(mocks.enable).toHaveBeenCalledOnce(); expect(mocks.save).toHaveBeenCalledOnce();
  const [preferences, version] = mocks.save.mock.calls[0];
  expect(version).toBe(0);
  expect(preferences).toMatchObject({enabled:true, intensity:"balanced", quietStart:"22:00", quietEnd:"08:00", weeklyDay:0,
    categories:{breakfast:{enabled:true,time:"08:00"},lunch:{enabled:true,time:"12:30"},dinner:{enabled:true,time:"19:00"},hydration:{enabled:true,time:"15:00"},workout:{enabled:true}}});
  expect(nudgeCategories.filter(c => preferences.categories[c].enabled)).toEqual(["breakfast", "lunch", "dinner", "workout", "hydration"]);
});
it("Light touch configures workouts and an eligible weekly review", async () => {
  await openSetup(); fireEvent.click(screen.getByRole("button", {name:"Light touch"}));
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name:"Use light touch"}));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  const preferences = mocks.save.mock.calls[0][0];
  expect(preferences.intensity).toBe("balanced");
  expect(nudgeCategories.filter(c => preferences.categories[c].enabled)).toEqual(["workout", "weekly"]);
});
it("preserves an existing custom setup exactly, including an opted-out master", async () => {
  const prefs=defaultNudgePreferences("Asia/Singapore"); prefs.categories.lunch={enabled:true,time:"13:15"}; prefs.quietStart="21:30";
  mocks.get.mockResolvedValue({available:true,categories:nudgeCategories,version:7,preferences:prefs});
  render(<NudgeSettingsClient />); await screen.findByText(/Custom setup/);
  expect(screen.getByRole("switch", {name:"Zoe smart nudges"})).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", {name:"Save preferences"}));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(prefs,7));
  expect(mocks.enable).not.toHaveBeenCalled();
});
it("does not replace the previous recommended setup until the user selects and saves the new one", async () => {
  const prefs=defaultNudgePreferences(); prefs.enabled=true; prefs.intensity="balanced";
  for(const c of ["workout","evening","weekly"] as const) prefs.categories[c].enabled=true;
  mocks.get.mockResolvedValue({available:true,categories:nudgeCategories,version:3,preferences:prefs});
  render(<NudgeSettingsClient />); await screen.findByText(/Custom setup/);
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Save preferences"}));
  await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith(prefs,3));
});
it("keeps personal times and quiet hours when an existing user explicitly chooses a preset", async () => {
  const prefs=defaultNudgePreferences("Asia/Singapore"); prefs.enabled=true; prefs.categories.lunch.time="13:15"; prefs.categories.hydration.time="16:00"; prefs.weeklyDay=3; prefs.quietStart="23:00";
  mocks.get.mockResolvedValue({available:true,categories:nudgeCategories,version:4,preferences:prefs});
  render(<NudgeSettingsClient />); await screen.findByText(/Custom setup/);
  fireEvent.click(screen.getByRole("button", {name:"Daily essentials, recommended"}));
  fireEvent.click(screen.getByRole("button", {name:"Save preferences"}));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({timezone:"Asia/Singapore", quietStart:"23:00",weeklyDay:3,
    categories:expect.objectContaining({lunch:{enabled:true,time:"13:15"},hydration:{enabled:true,time:"16:00"}})}),4));
});
it("keeps individual time controls inside Customise and saves edits when collapsed again", async () => {
  await openSetup(); customise();
  fireEvent.click(screen.getByText("Lunch", {selector:"summary span"}));
  fireEvent.change(screen.getByLabelText("Lunch time"), {target:{value:"13:15"}});
  fireEvent.change(screen.getByLabelText("Quiet hours start"), {target:{value:"21:30"}});
  customise(); expect(document.querySelector('input[type="time"]')).toBeNull();
  fireEvent.click(screen.getByRole("button", {name:"Use recommended setup"}));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  expect(mocks.save.mock.calls[0][0]).toMatchObject({enabled:true, quietStart:"21:30",categories:{lunch:{enabled:true,time:"13:15"},morning:{enabled:false}}});
});
it("saves choices with denied device permission without asking again or claiming a connection", async () => {
  mocks.permission.mockResolvedValue("denied"); await openSetup();
  fireEvent.click(screen.getByRole("button", {name:"Use recommended setup"}));
  await screen.findByText(/Preferences saved\. Notifications are blocked/);
  expect(mocks.enable).not.toHaveBeenCalled(); expect(screen.queryByText("This device is connected.")).toBeNull();
});
it("keeps a failed device registration distinct from saved preferences", async () => {
  mocks.enable.mockRejectedValue(new Error("Device registration took too long. Please try again."));
  await openSetup(); fireEvent.click(screen.getByRole("button", {name:"Use recommended setup"}));
  await screen.findByText(/Preferences saved\. Device registration took too long/);
  expect(screen.queryByText("This device is connected.")).toBeNull();
});
it("lets a paused-rollout account turn existing nudges off", async () => {
  const prefs=defaultNudgePreferences(); prefs.enabled=true;
  mocks.get.mockResolvedValue({available:false,categories:[],version:4,preferences:prefs});
  render(<NudgeSettingsClient />); await screen.findByRole("switch",{name:"Zoe smart nudges"});
  fireEvent.click(screen.getByRole("switch",{name:"Zoe smart nudges"})); fireEvent.click(screen.getByRole("button",{name:"Save preferences"}));
  await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({enabled:false}),4));
  expect(mocks.enable).not.toHaveBeenCalled();
});
it("does not offer a preset containing categories outside the account rollout", async () => {
  mocks.get.mockResolvedValue({available:true,categories:["workout","weekly"],version:0,preferences:defaultNudgePreferences()});
  render(<NudgeSettingsClient />); await waitFor(() => expect(screen.getByRole("button",{name:"Use light touch"})).toBeEnabled());
  expect(screen.getByRole("button",{name:"Daily essentials, recommended"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"Use light touch"}));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  expect(mocks.save.mock.calls[0][0].categories.evening.enabled).toBe(false);
});
it("reports multi-device conflicts without presenting an unsaved change as saved", async () => {
  mocks.save.mockRejectedValue(new Error("Settings changed on another device. Reload before saving."));
  await openSetup(); fireEvent.click(screen.getByRole("button",{name:"Use recommended setup"}));
  await screen.findByText(/Settings changed on another device/); expect(screen.queryByText(/Preferences saved/)).toBeNull();
  const saved=defaultNudgePreferences("Asia/Singapore"); saved.categories.lunch={enabled:true,time:"14:00"};
  mocks.get.mockResolvedValue({available:true,categories:nudgeCategories,version:2,preferences:saved});
  fireEvent.click(screen.getByRole("button",{name:"Reload saved choices"}));
  await screen.findByText(/Custom setup/);
  expect(screen.getByRole("switch",{name:"Zoe smart nudges"})).not.toBeChecked();
  expect(screen.queryByText(/Settings changed on another device/)).toBeNull();
});
