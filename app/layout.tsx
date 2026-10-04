import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "29",
  description: "Play 29 with friends",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1f17",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Staging = Vercel preview deployment; it keeps its own accounts and rooms. */}
        {process.env.VERCEL_ENV === "preview" && <div className="env-badge">STAGING</div>}
        {children}
      </body>
    </html>
  );
}
