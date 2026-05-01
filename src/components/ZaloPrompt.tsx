"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";

interface ZaloPromptProps {
  onSave: (zaloId: string, displayName: string) => Promise<void>;
  onDismiss: () => void;
}

export function ZaloPrompt({ onSave, onDismiss }: ZaloPromptProps) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [zaloId, setZaloId] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!zaloId.trim()) return;
    setSaving(true);
    try {
      await onSave(zaloId.trim(), name.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/20">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <svg viewBox="0 0 48 48" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden>
            <circle cx="24" cy="24" r="24" fill="#0068FF" />
            <path d="M12.5 16.5c0-2.21 1.79-4 4-4h15c2.21 0 4 1.79 4 4v9c0 2.21-1.79 4-4 4h-3.5l-4.5 4v-4h-7c-2.21 0-4-1.79-4-4v-9z" fill="white" />
          </svg>
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            {t("zaloPromptTitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded p-1 text-emerald-600 transition hover:bg-emerald-100 hover:text-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
          aria-label={t("zaloPromptDismiss")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <input
          type="text"
          placeholder={t("zaloPromptNamePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-white"
        />
        <input
          type="text"
          placeholder={t("zaloPromptIdPlaceholder")}
          value={zaloId}
          onChange={(e) => setZaloId(e.target.value)}
          required
          className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-white"
        />
        <button
          type="submit"
          disabled={saving || !zaloId.trim()}
          className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? t("zaloPromptSaving") : t("zaloPromptSave")}
        </button>
      </form>
    </div>
  );
}
