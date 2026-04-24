import type { Metadata } from "next";
import Script from "next/script";
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

const clarityProjectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

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
      <head>
        <script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="b7f3041f-7161-41ba-a414-d5c0618a2000"
        />
        {clarityProjectId ? (
          <Script
            id="clarity-script"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script",${JSON.stringify(clarityProjectId)});`,
            }}
          />
        ) : null}
      </head>
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
