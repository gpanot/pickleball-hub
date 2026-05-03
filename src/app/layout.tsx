import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppNavbar } from "@/components/AppNavbar";
import { AppFooter } from "@/components/AppFooter";
import { ClientProviders } from "@/components/ClientProviders";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
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
        {/* Preconnect to external origins to reduce connection latency */}
        <link rel="preconnect" href="https://cloud.umami.is" />
        <link rel="preconnect" href="https://cdn.mouseflow.com" />
        <link rel="dns-prefetch" href="https://reclub.co" />
        <link rel="preconnect" href="https://assets.reclub.co" />
        <link rel="preconnect" href="https://d1upr18ac2olqz.cloudfront.net" />
        <link rel="dns-prefetch" href="https://api.reclub.co" />
        {/* Per-build: if 404, replace href with the Geist woff2 name from `.next/static/media` after `next build` */}
        <link
          rel="preload"
          href="/_next/static/media/7178b3e590c64307-s.11.cyxs5p-0z~.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="b7f3041f-7161-41ba-a414-d5c0618a2000"
        />
        {/* Mouseflow: queue first, then deferred project script (same as official snippet; plain tags work reliably on Vercel). */}
        <script
          dangerouslySetInnerHTML={{
            __html: "window._mfq = window._mfq || [];",
          }}
        />
        <script defer src={mouseflowScriptSrc} type="text/javascript" />
      </head>
      <body className="min-h-full flex flex-col">
        <ClientProviders>
          <AppNavbar />
          <main className="min-w-0 flex-1">{children}</main>
          <AppFooter />
        </ClientProviders>
        <Analytics />
      </body>
    </html>
  );
}
