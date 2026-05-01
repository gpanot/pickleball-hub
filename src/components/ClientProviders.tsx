"use client";

import { I18nProvider } from "@/lib/i18n";
import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <I18nProvider>{children}</I18nProvider>
    </SessionProvider>
  );
}
