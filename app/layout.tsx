import type { Metadata, Viewport } from "next";
import { Inter, Rozha_One } from "next/font/google";
import "./globals.css";

// Self-hosted by Next.js at build time (no request to Google from players' phones).
const ui = Inter({ subsets: ["latin"], variable: "--font-ui" });
const display = Rozha_One({ subsets: ["latin"], weight: "400", variable: "--font-display" });

export const metadata: Metadata = {
  title: "29",
  description: "Play 29 with friends",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#16152b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${display.variable}`}>
      <body>
        {/* Staging = Vercel preview deployment; it keeps its own accounts and rooms. */}
        {process.env.VERCEL_ENV === "preview" && <div className="env-badge">STAGING</div>}
        {children}
      </body>
    </html>
  );
}
