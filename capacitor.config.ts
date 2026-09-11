/// <reference types="@capacitor-firebase/authentication" />
/// <reference types="@capacitor/push-notifications" />

import type { CapacitorConfig } from "@capacitor/cli";

const isIos = process.env.CAPACITOR_PLATFORM === "ios";
const remoteUrl = (isIos ? process.env.CAPACITOR_IOS_SERVER_URL : process.env.CAPACITOR_ANDROID_SERVER_URL)?.trim() || "https://www.getascend.fit/launch";
const androidLoggingBehavior = process.env.CAPACITOR_ANDROID_LOGGING_BEHAVIOR?.trim() || "production";

const config: CapacitorConfig = {
  appId: "fit.getascend.app",
  appName: "Ascend",
  webDir: "mobile-shell",
  backgroundColor: "#07090d",
  appendUserAgent: isIos ? " AscendIOS/2 Capacitor" : " AscendAndroid/1 Capacitor",
  ios: {
    contentInset: "automatic",
    includePlugins: ["@capacitor-firebase/authentication", "@capacitor/app", "@capacitor/camera", "@capacitor/filesystem", "@capacitor/share", "@capacitor/splash-screen", "@capacitor/status-bar"]
  },
  server: {
    url: remoteUrl,
    cleartext: false,
    androidScheme: "https",
    errorPath: "android-error.html"
  },
  android: {
    backgroundColor: "#07090d",
    minWebViewVersion: 60,
    resolveServiceWorkerRequests: true,
    loggingBehavior: androidLoggingBehavior as "debug" | "production" | "none"
  },
  plugins: {
    FirebaseAuthentication: {
      authDomain: "www.getascend.fit",
      skipNativeAuth: true,
      providers: isIos ? ["google.com", "apple.com"] : ["google.com"]
    },
    PushNotifications: {
      presentationOptions: ["alert", "sound"]
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 900,
      launchFadeOutDuration: 200,
      backgroundColor: "#07090d",
      showSpinner: false
    }
  }
};

export default config;
