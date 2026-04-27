"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export function SessionDetailNotFound() {
  const { t } = useI18n();
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-12 text-center">
      <h1 className="text-lg font-bold text-foreground">{t("sessionDetailNotFoundTitle")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("sessionDetailNotFoundBody")}</p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white transition hover:bg-primary-dark"
      >
        {t("backToHome")}
      </Link>
    </div>
  );
}
