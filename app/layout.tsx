import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TutorAI — Learn anything, faster",
  description: "Upload documents and chat with AI to understand them deeply.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Fonts are loaded in globals.css via @import */}
      </head>
      <body>{children}</body>
    </html>
  );
}
