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

/** Default project UUID from Mouseflow snippet; override with NEXT_PUBLIC_MOUSEFLOW_PROJECT_ID. */
const MOUSEFLOW_DEFAULT_PROJECT_ID = "c05d4709-4143-4a9b-b914-0aa21a9f2bdf";

const mouseflowProjectId =
  process.env.NEXT_PUBLIC_MOUSEFLOW_PROJECT_ID || MOUSEFLOW_DEFAULT_PROJECT_ID;

const mouseflowScriptSrc = `https://cdn.mouseflow.com/projects/${mouseflowProjectId}.js`;

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
      </head>
      <body className="min-h-full flex flex-col">
        <ClientProviders>
          <AppNavbar />
          <main className="min-w-0 flex-1">{children}</main>
          <AppFooter />
        </ClientProviders>
        <Script
          id="mouseflow"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `window._mfq=window._mfq||[];(function(){var mf=document.createElement("script");mf.type="text/javascript";mf.defer=true;mf.src=${JSON.stringify(mouseflowScriptSrc)};document.getElementsByTagName("head")[0].appendChild(mf);})();`,
          }}
        />
      </body>
    </html>
  );
}
