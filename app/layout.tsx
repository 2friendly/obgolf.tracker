import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Golf Progress | Road to 90",
  description: "Your practice, rounds, next steps and spending, in one place.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
