import type { Metadata, Viewport } from "next";
import { AuthStateGuard } from "@/components/AuthStateGuard";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ascend",
  description: "Trainer-first fitness accountability",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Ascend",
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = {
  themeColor: "#a7f04f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <AuthStateGuard />
        {children}
      </body>
    </html>
  );
}
