"use client";

import { useI18n } from "@/lib/i18n";

export function AppFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-card-border py-6 text-center text-sm text-muted">
      {t("footer")}
    </footer>
  );
}
