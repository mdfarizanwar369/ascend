/// <reference types="@capacitor-firebase/authentication" />
/// <reference types="@capacitor/push-notifications" />

import type { CapacitorConfig } from "@capacitor/cli";

const remoteUrl = process.env.CAPACITOR_ANDROID_SERVER_URL?.trim() || "https://www.getascend.fit/launch";
const androidLoggingBehavior = process.env.CAPACITOR_ANDROID_LOGGING_BEHAVIOR?.trim() || "production";
const firebaseAuthDomain = process.env.CAPACITOR_ANDROID_FIREBASE_AUTH_DOMAIN?.trim() || "www.getascend.fit";

const config: CapacitorConfig = {
  appId: "fit.getascend.app",
  appName: "Ascend",
  webDir: "mobile-shell",
  backgroundColor: "#07090d",
  appendUserAgent: " AscendAndroid/1 Capacitor",
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
      authDomain: firebaseAuthDomain,
      skipNativeAuth: true,
      providers: ["google.com"]
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
