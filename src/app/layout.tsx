import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TalantaLink Kenya | Home of Talents",
  description:
    "A professional community for Kenya's talent to connect, share their work and discover opportunities.",
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
