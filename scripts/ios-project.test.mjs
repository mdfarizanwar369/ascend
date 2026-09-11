import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";

const read = (path) => fs.readFileSync(path, "utf8");
function config(env) {
  const code = ts.transpileModule(read("capacitor.config.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { exports: {}, process: { env }, URL };
  vm.runInNewContext(code, context);
  return context.exports.default;
}

test("iOS and Android use their own URL and platform marker", () => {
  const ios = config({ CAPACITOR_PLATFORM: "ios", CAPACITOR_IOS_SERVER_URL: "https://ios.example/launch", CAPACITOR_ANDROID_SERVER_URL: "https://android.example/launch" });
  const android = config({ CAPACITOR_ANDROID_SERVER_URL: "https://android.example/launch" });
  assert.equal(ios.server.url, "https://ios.example/");
  assert.equal(ios.server.appStartPath, "/launch");
  assert.equal(android.server.url, "https://android.example/launch");
  assert.match(ios.appendUserAgent, /AscendIOS/);
  assert.match(android.appendUserAgent, /AscendAndroid/);
  assert.equal(ios.appId, "fit.getascend.app");
  assert.equal(ios.server.cleartext, false);
});

test("iOS startup and account navigation remain inside the configured app origin", () => {
  const ios = config({ CAPACITOR_PLATFORM: "ios" });
  assert.equal(new URL(ios.server.appStartPath, ios.server.url).href, "https://www.getascend.fit/launch");
  for (const path of ["/login", "/dashboard", "/profile"]) {
    assert.ok(new URL(path, ios.server.url).href.startsWith(ios.server.url));
  }
  assert.ok(!"https://accounts.google.com/".startsWith(ios.server.url));
  assert.ok(!"https://www.getascend.fit.example/".startsWith(ios.server.url));
});

test("iOS remote start path also has the bundled path required by Capacitor", () => {
  const ios = config({ CAPACITOR_PLATFORM: "ios" });
  const startPath = ios.server.appStartPath.replace(/^\/+/, "");
  assert.ok(fs.existsSync(`${ios.webDir}/${startPath}`), "Capacitor exits before loading a remote URL if its local start path is missing");
  assert.ok(fs.existsSync(`ios/App/App/public/${startPath}`), "ios:prepare must package the local start path");
});

test("synced iOS project resolves portable plugin paths and includes its privacy resource", () => {
  const manifest = read("ios/App/CapApp-SPM/Package.swift");
  assert.ok(!manifest.includes("\\"), "Swift package paths must use forward slashes");
  assert.match(manifest, /CapacitorCamera/);
  assert.match(manifest, /FirebaseAuthentication/);
  assert.match(read("ios/App/App/App.entitlements"), /com.apple.developer.applesignin/);
  assert.match(read("ios/App/App/Info.plist"), /com.googleusercontent.apps.790770085471/);
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
