import { ServiceWorkerInit } from "@/components/ServiceWorkerInit";
import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { BRAND, brandCssVars } from "../lib/whiteLabel";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Titles, description and theme colour come from lib/whiteLabel.ts. The
// manifest and icons are app/manifest.ts, app/icon.tsx and app/apple-icon.tsx.
export const metadata: Metadata = {
  title: { default: BRAND.productName, template: `%s · ${BRAND.productName}` },
  description: BRAND.description,
  applicationName: BRAND.productName,
  appleWebApp: { title: BRAND.shortName },
};

export const viewport: Viewport = {
  themeColor: BRAND.colours.primary,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={brandCssVars() as CSSProperties}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerInit />
        {children}
      </body>
    </html>
  );
}