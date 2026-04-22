import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Organizer Dashboard | HCM Pickleball Hub",
  description: "Club analytics dashboard: fill rate trends, competitive analysis, revenue estimates, and scheduling recommendations.",
};

export default function OrganizerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
