"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";

export function SessionDetailBackButton() {
  const router = useRouter();
  const { t } = useI18n();

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  return (
    <button
      type="button"
      onClick={goBack}
      className="mb-4 inline-flex min-h-[44px] items-center rounded-lg px-2 py-2 text-sm font-medium text-primary transition hover:bg-primary/10"
    >
      {t("backToAllSessions")}
    </button>
  );
}
