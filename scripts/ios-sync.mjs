import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";

const googleConfig = "ios/App/App/GoogleService-Info.plist";
if (process.env.IOS_GOOGLE_SERVICE_INFO_BASE64) {
  writeFileSync(googleConfig, Buffer.from(process.env.IOS_GOOGLE_SERVICE_INFO_BASE64, "base64"));
} else if (!existsSync(googleConfig)) {
  // PR simulator builds compile without production client configuration.
  copyFileSync("ios/App/App/GoogleService-Info.example.plist", googleConfig);
}

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
