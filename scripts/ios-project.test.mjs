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

test("Siri intents are packaged in the iPhone app with private, device-authenticated answers", () => {
  const project = read("ios/App/App.xcodeproj/project.pbxproj");
  for (const file of ["AscendSiriService.swift", "AscendSiriPlugin.swift", "AscendSiriIntents.swift"]) {
    assert.match(project, new RegExp(`${file.replace(".", "\\.")} in Sources`));
  }
  const intents = read("ios/App/App/AscendSiriIntents.swift");
  assert.match(intents, /requiresLocalDeviceAuthentication/);
  assert.match(intents, /calories_remaining/);
  assert.match(intents, /water_status/);
  assert.match(intents, /protein_status/);
  assert.match(intents, /today_summary/);
  assert.match(intents, /struct AscendTopicIntent: AppIntent/);
  assert.ok(intents.includes('Check \\(\\.$topic) in \\(.applicationName)'));
  assert.ok(intents.includes('case waterDrank = "How much water did I drink today?"'));
  assert.ok(intents.includes('Ask \\(.applicationName) how much water I drank'));
  assert.ok(intents.includes('Check how much water I drank in \\(.applicationName)'));
  assert.ok(intents.includes('Ask \\(.applicationName) \\(\\.$topic)'), "question topics must work in a single Siri utterance");
  assert.ok(intents.includes('Ask \\(.applicationName) how much more water do I need today'));
  assert.ok(intents.includes('Ask \\(.applicationName) have I logged any workout today'));
  assert.ok(intents.includes('Ask \\(.applicationName) have I logged any food today'));
  assert.match(intents, /struct AscendWorkoutLoggedIntent: AppIntent/);
  assert.match(intents, /struct AscendFoodLoggedIntent: AppIntent/);
  assert.ok(!intents.includes('Ask \\(.applicationName) \\(\\.$question)'), "App Shortcuts only interpolate AppEntity or AppEnum parameters");
  assert.match(intents, /struct AscendWorkoutIntent: AppIntent/);
  assert.equal((intents.match(/AppShortcut\(intent:/g) ?? []).length, 10);
  assert.match(read("ios/App/App/AppDelegate.swift"), /updateAppShortcutParameters/);
  const service = read("ios/App/App/AscendSiriService.swift");
  assert.match(service, /kSecAttrAccessibleWhenUnlockedThisDeviceOnly/);
  assert.doesNotMatch(service, /gemini|voice\/today\/audio/i);
  assert.match(service, /endpoint\("siri\/ask"/);
});

test("iOS 1.4 trainer referral web links use the matching production app identity", () => {
  const project = read("ios/App/App.xcodeproj/project.pbxproj");
  assert.equal((project.match(/MARKETING_VERSION = 1\.4;/g) ?? []).length, 4);
  assert.doesNotMatch(read("ios/App/App/App.entitlements"), /com\.apple\.developer\.associated-domains/);
  const association = JSON.parse(read("frontend/public/.well-known/apple-app-site-association"));
  assert.deepEqual(association.applinks.details[0].appIDs, ["76N75VT6A7.fit.getascend.app"]);
  assert.equal(association.applinks.details[0].components[0]["?"].trainer, "*");
});

test("App Store icon is 1024px and opaque", async () => {
  const icon = await sharp("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png").metadata();
  assert.equal(icon.width, 1024);
  assert.equal(icon.height, 1024);
  assert.equal(icon.hasAlpha, false);
});

test("Apple Health bridge is read-only, private and registered in the native app", () => {
  const project = read("ios/App/App.xcodeproj/project.pbxproj");
  for (const file of ["AscendHealthService.swift", "AscendHealthPlugin.swift", "AscendHealthSyncStore.swift"]) {
    assert.match(project,new RegExp(`${file.replace(".","\\.")} in Sources`));
  }
  assert.match(read("ios/App/App/App.entitlements"),/com.apple.developer.healthkit.background-delivery/);
  const info = read("ios/App/App/Info.plist");
  assert.match(info,/NSHealthShareUsageDescription/);
  assert.match(info,/NSHealthUpdateUsageDescription/);
  assert.match(info,/Ascend does not add or change data in Apple Health/);
  const service = read("ios/App/App/AscendHealthService.swift");
  assert.match(service,/requestAuthorization\(toShare: \[\], read: readTypes\)/);
  assert.doesNotMatch(service,/\.heartRate|\.sleepAnalysis|\.basalEnergyBurned|\.dietaryEnergyConsumed/);
  assert.match(service,/completion\(\)/);
  const store = read("ios/App/App/AscendHealthSyncStore.swift");
  assert.match(store,/completeFileProtection/);
  assert.match(store,/isExcludedFromBackup = true/);
  assert.match(read("ios/App/App/AscendViewController.swift"),/AscendHealthPlugin\(\)/);
  assert.match(read("ios/App/App/AppDelegate.swift"),/AscendHealthService.shared.restore/);
});

test("Ascend Today widget is embedded, private, branded and signed through a shared App Group", () => {
  const project = read("ios/App/App.xcodeproj/project.pbxproj");
  assert.match(project, /AscendWidgetExtension\.appex in Embed App Extensions/);
  assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER = fit\.getascend\.app\.widget/);
  assert.match(project, /ASCEND_WIDGET_PROFILE_UUID/);
  for (const file of ["AscendWidget.swift", "AscendWidgetBundle.swift", "AscendWidgetSnapshot.swift"]) {
    assert.match(project, new RegExp(`${file.replace(".", "\\.")} in Sources`));
  }
  const appEntitlements = read("ios/App/App/App.entitlements");
  const widgetEntitlements = read("ios/App/AscendWidget/AscendWidget.entitlements");
  for (const entitlements of [appEntitlements, widgetEntitlements]) {
    assert.match(entitlements, /group\.fit\.getascend\.app/);
  }
  const widget = read("ios/App/AscendWidget/AscendWidget.swift");
  assert.match(widget, /privacySensitive\(\)/);
  assert.match(widget, /AscendMark/);
  assert.match(widget, /ProgressPath/);
  assert.match(widget, /\.systemSmall, \.systemMedium, \.accessoryRectangular/);
  assert.ok(fs.existsSync("ios/App/AscendWidget/Assets.xcassets/AscendMark.imageset/ascend-mark.png"));
  assert.ok(fs.existsSync("ios/App/AscendWidget/Assets.xcassets/ProgressPath.imageset/progress-path.jpg"));
  assert.match(read("ios/App/App/Info.plist"), /<string>ascend<\/string>/);
  assert.match(read("ios/App/App/AscendWidgetService.swift"), /endpoint\("siri\/widget"/);
  assert.match(read("ios/App/AscendWidget/PrivacyInfo.xcprivacy"), /1C8F\.1/);
  const release = read("scripts/ios-release.py");
  assert.match(release, /CODE_SIGN_STYLE=Automatic/);
  assert.match(release, /CODE_SIGN_IDENTITY=/);
  assert.match(release, /-allowProvisioningUpdates/);
  assert.doesNotMatch(release, /IOS_WIDGET_PROFILE_BASE64/);
});

test("iOS packages its own startup/offline copy without other-platform promotion", () => {
  const ios = config({ CAPACITOR_PLATFORM: "ios" });
  const android = config({});
  assert.equal(android.webDir, "mobile-shell");
  assert.equal(android.server.errorPath, "android-error.html");
  assert.equal(ios.server.errorPath, "offline.html");
  for (const path of ["index.html", "launch/index.html", ios.server.errorPath]) {
    assert.doesNotMatch(read(`${ios.webDir}/${path}`), /android|google play|health connect/i);
    assert.equal(read(`ios/App/App/public/${path}`), read(`${ios.webDir}/${path}`));
  }
  assert.equal(fs.existsSync("ios/App/App/public/android-error.html"), false);
});
