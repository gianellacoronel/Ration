import type { Metadata } from "next";
import {
  Archivo_Black,
  Caveat,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
} from "next/font/google";

import { rationConfig } from "@/config/ration";
import { themeConfig } from "@/config/theme";

import "./globals.css";

const bodyFont = IBM_Plex_Sans({
  variable: "--font-ration-sans",
  subsets: ["latin"],
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-ration-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const displayFont = Archivo_Black({
  variable: "--font-ration-display",
  subsets: ["latin"],
  weight: "400",
});

const handwrittenFont = Caveat({
  variable: "--font-ration-hand",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: rationConfig.title,
  description: rationConfig.description,
  applicationName: rationConfig.name,
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    type: "website",
    title: rationConfig.title,
    description: rationConfig.description,
    siteName: rationConfig.name,
  },
  twitter: {
    card: "summary",
    title: rationConfig.title,
    description: rationConfig.description,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme={themeConfig.defaultTheme}
      suppressHydrationWarning
      className={`${bodyFont.variable} ${monoFont.variable} ${displayFont.variable} ${handwrittenFont.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('${themeConfig.storageKey}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
