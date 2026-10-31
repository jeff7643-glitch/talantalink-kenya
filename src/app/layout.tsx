import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Kenya’s talent community",
    template: "%s | TalantaLink Kenya",
  },
  description:
    "Share your work, meet Kenya’s creative community and discover opportunities that help your talent grow.",
  openGraph: {
    title: "Kenya’s talent community",
    description: "Share your work, meet Kenya’s creative community and discover opportunities that help your talent grow.",
    siteName: "TalantaLink Kenya",
    type: "website",
  },
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
