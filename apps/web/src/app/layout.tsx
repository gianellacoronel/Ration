import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { rationConfig } from "@/config/ration";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
