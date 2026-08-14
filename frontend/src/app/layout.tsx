import type { Metadata, Viewport } from "next";
import { AuthStateGuard } from "@/components/AuthStateGuard";
import { CapacitorAppUrlRouter } from "@/components/CapacitorAppUrlRouter";
import { CanonicalDomainGuard } from "@/components/CanonicalDomainGuard";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import { PwaInstallCoordinator } from "@/components/PwaInstallCoordinator";
import { CoachNotificationCoordinator } from "@/components/CoachNotificationCoordinator";
import { HealthSyncCoordinator } from "@/components/HealthSyncCoordinator";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.getascend.fit"),
  title: "Ascend | Fitness accountability between sessions",
  description: "Know what to do today with practical coaching for meals, movement, recovery, and progress.",
  applicationName: "Ascend",
  authors: [{ name: "Ascend" }],
  creator: "Ascend",
  publisher: "Ascend",
  manifest: "/manifest.json",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Ascend",
    title: "Ascend | Know what to do today",
    description: "Practical fitness accountability for the hours between sessions.",
    images: [{ url: "/marketing/ascend-social-share.png", width: 1024, height: 500, alt: "Ascend coaches the other 166 hours" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Ascend | Know what to do today",
    description: "Practical fitness accountability for the hours between sessions.",
    images: ["/marketing/ascend-social-share.png"]
  },
  robots: { index: true, follow: true },
  icons: {
    icon: "/brand/ascend-logo.png",
    apple: "/brand/ascend-logo.png"
  },
  appleWebApp: {
    capable: true,
    title: "Ascend",
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = {
  themeColor: "#35f2d0",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

const themeBootScript = `
  (function () {
    if (navigator.userAgent.indexOf("AscendAndroid/1") !== -1) {
      document.documentElement.dataset.nativePlatform = "android";
    }

    try {
      var saved = localStorage.getItem("ascend-theme");
      document.documentElement.dataset.theme = saved === "light" ? "light" : "dark";
    } catch (_) {
      document.documentElement.dataset.theme = "dark";
    }
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <CanonicalDomainGuard />
        <AuthStateGuard />
        <CapacitorAppUrlRouter />
        <PwaRegistrar />
        <PwaInstallCoordinator />
        <CoachNotificationCoordinator />
        <HealthSyncCoordinator />
        <OfflineIndicator />
        {children}
      </body>
    </html>
  );
}
