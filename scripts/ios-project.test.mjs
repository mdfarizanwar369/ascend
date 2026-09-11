import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";

const read = (path) => fs.readFileSync(path, "utf8");
function config(env) {
  const code = ts.transpileModule(read("capacitor.config.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { exports: {}, process: { env } };
  vm.runInNewContext(code, context);
  return context.exports.default;
}

test("iOS and Android use their own URL and platform marker", () => {
  const ios = config({ CAPACITOR_PLATFORM: "ios", CAPACITOR_IOS_SERVER_URL: "https://ios.example/launch", CAPACITOR_ANDROID_SERVER_URL: "https://android.example/launch" });
  const android = config({ CAPACITOR_ANDROID_SERVER_URL: "https://android.example/launch" });
  assert.equal(ios.server.url, "https://ios.example/launch");
  assert.equal(android.server.url, "https://android.example/launch");
  assert.match(ios.appendUserAgent, /AscendIOS/);
  assert.match(android.appendUserAgent, /AscendAndroid/);
  assert.equal(ios.appId, "fit.getascend.app");
  assert.equal(ios.server.cleartext, false);
});

test("synced iOS project resolves portable plugin paths and includes its privacy resource", () => {
  const manifest = read("ios/App/CapApp-SPM/Package.swift");
  assert.ok(!manifest.includes("\\"), "Swift package paths must use forward slashes");
  assert.match(manifest, /CapacitorCamera/);
  assert.ok(!manifest.includes("Firebase"), "Firebase native setup is not configured yet");
  const project = read("ios/App/App.xcodeproj/project.pbxproj");
  assert.match(project, /PrivacyInfo.xcprivacy in Resources/);
  assert.match(read("ios/App/App/Info.plist"), /NSCameraUsageDescription/);
});

test("App Store icon is 1024px and opaque", async () => {
  const icon = await sharp("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png").metadata();
  assert.equal(icon.width, 1024);
  assert.equal(icon.height, 1024);
  assert.equal(icon.hasAlpha, false);
});
