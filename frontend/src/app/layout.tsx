import type { Metadata, Viewport } from "next";
import { AuthStateGuard } from "@/components/AuthStateGuard";
import { CanonicalDomainGuard } from "@/components/CanonicalDomainGuard";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import { PwaInstallCoordinator } from "@/components/PwaInstallCoordinator";
import { CoachNotificationCoordinator } from "@/components/CoachNotificationCoordinator";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ascend",
  description: "Trainer-first fitness accountability",
  manifest: "/manifest.json",
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
        <PwaRegistrar />
        <PwaInstallCoordinator />
        <CoachNotificationCoordinator />
        {children}
      </body>
    </html>
  );
}
