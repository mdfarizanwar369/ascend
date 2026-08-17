import assert from "node:assert/strict";
import test from "node:test";

import {
  LIVING_ASCENT_FIRST_SEEN_KEY,
  LIVING_ASCENT_LAST_OPEN_KEY,
  localDateKey,
  selectLivingAscentMode
} from "./livingAscentPolicy.ts";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    values
  };
}

test("selects the full cinematic experience exactly once", () => {
  const storage = memoryStorage();

  assert.equal(selectLivingAscentMode(storage, "2026-08-18"), "first");
  assert.equal(storage.values.get(LIVING_ASCENT_FIRST_SEEN_KEY), "true");
  assert.equal(storage.values.get(LIVING_ASCENT_LAST_OPEN_KEY), "2026-08-18");
  assert.equal(selectLivingAscentMode(storage, "2026-08-18"), null);
});

test("selects the compressed opening once on a later day", () => {
  const storage = memoryStorage({
    [LIVING_ASCENT_FIRST_SEEN_KEY]: "true",
    [LIVING_ASCENT_LAST_OPEN_KEY]: "2026-08-17"
  });

  assert.equal(selectLivingAscentMode(storage, "2026-08-18"), "daily");
  assert.equal(selectLivingAscentMode(storage, "2026-08-18"), null);
});

test("uses the device-local calendar day", () => {
  assert.equal(localDateKey(new Date(2026, 7, 8, 23, 59)), "2026-08-08");
});
