import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "OBE IQAC Command Center", template: "%s · OBE IQAC Command Center" },
  description: "Outcome-based education, attainment and IQAC management platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
