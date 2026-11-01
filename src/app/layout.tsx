import type { Metadata } from "next";
import type { ReactNode } from "react";
import ThemeToggle from "@/components/theme-toggle";
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
    icon: "/talantalink-logo.jpg",
    apple: "/talantalink-logo.jpg",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('talantalink-theme');document.documentElement.dataset.theme=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}catch{document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}",
          }}
        />
      </head>
      <body>
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
