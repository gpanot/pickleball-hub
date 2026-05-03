"use client";

import { useState, useCallback } from "react";
import { Share2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface ShareButtonProps {
  /** Text sent to navigator.share */
  shareText: string;
  /** URL copied to clipboard when native share is unavailable */
  shareUrl: string;
  /** Button label — defaults to t("shareWithFriends") */
  label?: string;
}

/**
 * Floating dark frosted-glass share pill — matches the style used on the
 * home/sessions page. Fixed, centered at the bottom of the viewport.
 */
export function ShareButton({ shareText, shareUrl, label }: ShareButtonProps) {
  const { t } = useI18n();
  const [toast, setToast] = useState(false);

  const handleShare = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: shareText });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      setToast(true);
      window.setTimeout(() => setToast(false), 2500);
    }
  }, [shareText, shareUrl]);

  return (
    <>
      <button
        type="button"
        onClick={() => void handleShare()}
        className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-full bg-gray-900/75 px-4 py-2.5 text-xs font-medium text-white shadow-lg backdrop-blur-md transition hover:bg-gray-900/90 active:scale-95 dark:bg-white/20"
      >
        <Share2 size={14} />
        {label ?? t("shareWithFriends")}
      </button>

      {toast && (
        <div className="pointer-events-none fixed bottom-14 left-1/2 z-[110] -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2.5 text-xs font-medium text-white shadow-xl">
          {t("shareClipboardToast")}
        </div>
      )}
    </>
  );
}
