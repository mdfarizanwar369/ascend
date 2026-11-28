import { webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createCycleBackup, openCycleBackup } from "./cycleBackup";
import { mergeCycleEntries, writeCycleEntry, type CycleEntries } from "./cycleLog";

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

it("encrypts a portable log, rejects a wrong password, and preserves overlapping local dates on import", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const entry = { period: true, flow: "heavy", symptoms: ["cramps"], energy: "low" } as const;
  const entries: CycleEntries = {
    "2026-11-20": { ...entry, symptoms: ["cramps"] },
    "2026-11-21": { ...entry, symptoms: ["cramps"] }
  };
  const password = "test only portable password";
  const backup = await createCycleBackup(entries, password);
  expect(backup).not.toContain("2026-11-20");
  expect(backup).not.toContain("cramps");
  await expect(openCycleBackup(backup, "wrong backup password", "2026-11-29")).rejects.toThrow();
  const recovered = await openCycleBackup(backup, password, "2026-11-29");
  expect(recovered).toEqual(entries);
  const existing = { ...entries["2026-11-20"], energy: null };
  writeCycleEntry(localStorage, "account", "2026-11-20", existing);
  expect(mergeCycleEntries(localStorage, "account", recovered)).toEqual({
    entries: { ...entries, "2026-11-20": existing }, added: 1, skipped: 1
  });
});
