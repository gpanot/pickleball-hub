import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Venue Dashboard | HCM Pickleball Hub",
  description: "Venue utilization dashboard: court usage heatmap, hosted clubs, dead hours identification, and revenue breakdowns.",
};

export default function VenueLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
