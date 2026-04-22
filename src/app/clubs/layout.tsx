import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Club Directory | HCM Pickleball Hub",
  description: "Browse all pickleball clubs in Ho Chi Minh City. Compare fill rates, pricing, session frequency, and member counts.",
};

export default function ClubsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
