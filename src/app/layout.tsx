import type { Metadata, Viewport } from "next";

import { PwaRuntime } from "@/components/pwa/pwa-runtime";

import "./globals.css";
import "./shadow-system.css";
import "../../public/system-boot.css";
import "./scroll-focus.css";
import "./update-dialog.css";
import "./avatar-identity.css";
import "./install-system.css";

export const metadata: Metadata = {
  title: {
    default: "Winter Arc",
    template: "%s | Winter Arc",
  },
  description: "A 90-day discipline and body-transformation protocol.",
  applicationName: "Winter Arc",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Winter Arc",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#03070c",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PwaRuntime />
        {children}
      </body>
    </html>
  );
}
