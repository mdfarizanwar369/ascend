/// <reference types="@capacitor-firebase/authentication" />

import type { CapacitorConfig } from "@capacitor/cli";

const remoteUrl = process.env.CAPACITOR_ANDROID_SERVER_URL?.trim() || "https://www.getascend.fit/launch";

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
    loggingBehavior: "debug"
  },
  plugins: {
    FirebaseAuthentication: {
      authDomain: "www.getascend.fit",
      skipNativeAuth: true,
      providers: ["google.com"]
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
