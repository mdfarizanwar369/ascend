import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const result = spawnSync(process.execPath, ["node_modules/@capacitor/cli/bin/capacitor", process.argv[2] || "sync", "ios"], {
  stdio: "inherit",
  env: { ...process.env, CAPACITOR_PLATFORM: "ios" }
});
if (result.error) throw result.error;
if (result.status === 0) {
  // Capacitor emits Windows path separators when preparing the project on Windows.
  const manifest = "ios/App/CapApp-SPM/Package.swift";
  writeFileSync(manifest, readFileSync(manifest, "utf8").replaceAll("\\", "/"));
}
process.exit(result.status ?? 1);
