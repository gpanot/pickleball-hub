import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppNavbar } from "@/components/AppNavbar";
import { AppFooter } from "@/components/AppFooter";
import { ClientProviders } from "@/components/ClientProviders";
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
  title: {
    default: "HCM Pickleball Hub",
    template: "%s | HCM Pickleball Hub",
  },
  description: "Find pickleball sessions, compare clubs, and track court availability in Ho Chi Minh City. Real-time data, smart filters, and analytics for players, organizers, and venues.",
  keywords: ["pickleball", "ho chi minh city", "saigon", "sessions", "courts", "booking", "reclub"],
  openGraph: {
    title: "HCM Pickleball Hub",
    description: "The smart way to find pickleball in Saigon",
    type: "website",
    locale: "en_US",
  },
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
    >
      <body className="min-h-full flex flex-col">
        <ClientProviders>
          <AppNavbar />
          <main className="min-w-0 flex-1">{children}</main>
          <AppFooter />
        </ClientProviders>
      </body>
    </html>
  );
}
