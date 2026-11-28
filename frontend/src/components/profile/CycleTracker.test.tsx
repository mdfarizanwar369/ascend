import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CycleCalendar } from "./CycleTracker";
import { cycleStorageKey, readCycleEntries } from "@/lib/cycleLog";

afterEach(() => { cleanup(); localStorage.clear(); });

it("saves and restores a day on this device, isolates accounts, and lets the client delete it", async () => {
  const first = render(<CycleCalendar accountId="account-a" />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Period day" }));
  fireEvent.click(screen.getByRole("button", { name: "medium" }));
  fireEvent.click(screen.getByRole("button", { name: "cramps" }));
  fireEvent.click(screen.getByRole("button", { name: "low" }));
  fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
  expect(await screen.findByText("Saved on this device.")).toBeVisible();
  expect(Object.values(readCycleEntries(localStorage, "account-a"))).toEqual([
    { period: true, flow: "medium", symptoms: ["cramps"], energy: "low" }
  ]);
  first.unmount();
  const other = render(<CycleCalendar accountId="account-b" />);
  expect(screen.getByRole("checkbox", { name: "Period day" })).not.toBeChecked();
  expect(screen.queryByRole("button", { name: "Delete entry" })).toBeNull();
  other.unmount();
  render(<CycleCalendar accountId="account-a" />);
  expect(screen.getByRole("checkbox", { name: "Period day" })).toBeChecked();
  expect(screen.getByRole("button", { name: "cramps" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Delete entry" }));
  await waitFor(() => expect(localStorage.getItem(cycleStorageKey("account-a"))).toBeNull());
});
