import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import MaintenanceScreen from "./maintenance-screen";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://ugvoicetranscribe-three.vercel.app"),
  title: "UGVoice Transcribe",
  description: "Transcribe audio files using our models.",
  verification: {
    google: "_lCe2iAUIzZ_GakDP9V6q5fnQnueruXExk0zvc9BUg8",
  },
  alternates: { canonical: "/" },
  openGraph: {
    title: "UGVoice Transcribe",
    description: "Transcribe audio files using our models.",
    url: "/",
    siteName: "UGVoice Transcribe",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "UGVoice Transcribe",
    description: "Transcribe audio files using our models.",
  },
  robots: {
    index: true,
    follow: true,
  },
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isMaintenanceMode =
    process.env.MAINTENANCE_MODE?.trim().toLowerCase() === "true";

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {isMaintenanceMode ? <MaintenanceScreen /> : children}
      </body>
    </html>
  );
}
