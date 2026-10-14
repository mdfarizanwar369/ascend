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
it("opens opted out and asks for OS permission only after an explicit device action", async () => {
  render(<NudgeSettingsClient />); await screen.findByRole("switch", { name: "Zoe smart nudges" });
  expect(screen.getByRole("switch", {name:"Zoe smart nudges"})).not.toBeChecked(); expect(mocks.enable).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name:"Enable this device"}));
  await waitFor(()=>expect(mocks.enable).toHaveBeenCalledOnce()); expect(mocks.save).not.toHaveBeenCalled();
});
it("saves selected schedules and quiet hours without silently adding routine nudges", async () => {
  render(<NudgeSettingsClient />); await screen.findByRole("switch", {name:"Zoe smart nudges"});
  fireEvent.click(screen.getByRole("switch", {name:"Zoe smart nudges"}));
  fireEvent.click(screen.getByText("Lunch", {selector:"summary span"}));
  fireEvent.click(screen.getByRole("switch", {name:"Lunch"}));
  fireEvent.change(screen.getByLabelText("Lunch time"),{target:{value:"13:15"}});
  fireEvent.change(screen.getByLabelText("Quiet hours start"),{target:{value:"21:30"}});
  fireEvent.click(screen.getByRole("button",{name:"Save preferences"}));
  await waitFor(()=>expect(mocks.save).toHaveBeenCalledOnce());
  expect(mocks.save.mock.calls[0][0]).toMatchObject({enabled:true,intensity:"minimal",quietStart:"21:30",categories:{lunch:{enabled:true,time:"13:15"},morning:{enabled:false}}});
});
it("explains denied permission without a repeated enable button", async () => {
  mocks.permission.mockResolvedValue("denied"); render(<NudgeSettingsClient />);
  await screen.findByText(/Notifications are blocked/); expect(screen.queryByRole("button",{name:"Enable this device"})).toBeNull(); expect(mocks.enable).not.toHaveBeenCalled();
});
it("lets a paused-rollout account turn existing nudges off", async () => {
  const prefs=defaultNudgePreferences(); prefs.enabled=true;
  mocks.get.mockResolvedValue({available:false,categories:[],version:4,preferences:prefs});
  render(<NudgeSettingsClient />); await screen.findByRole("switch",{name:"Zoe smart nudges"});
  fireEvent.click(screen.getByRole("switch",{name:"Zoe smart nudges"})); fireEvent.click(screen.getByRole("button",{name:"Save preferences"}));
  await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({enabled:false}),4));
});
it("reports multi-device conflicts without presenting an unsaved change as saved", async () => {
  mocks.save.mockRejectedValue(new Error("Settings changed on another device. Reload before saving."));
  render(<NudgeSettingsClient />); await screen.findByRole("switch",{name:"Zoe smart nudges"});
  fireEvent.click(screen.getByRole("button",{name:"Save preferences"}));
  await screen.findByText(/Settings changed on another device/); expect(screen.queryByText(/Preferences saved/)).toBeNull();
});
