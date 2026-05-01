"use client";

import { useState } from "react";
import type { PlayerPreferences } from "@/store/profileStore";
import { useI18n } from "@/lib/i18n";

type Step1Answer = PlayerPreferences["timeSlots"];
type Step2Answer = PlayerPreferences["level"];
type Step3Answer = PlayerPreferences["travelTime"];

interface OnboardingQnAProps {
  onComplete: (prefs: Omit<PlayerPreferences, "clickedSessions" | "visitCount">) => void;
}

export function OnboardingQnA({ onComplete }: OnboardingQnAProps) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<{
    timeSlots?: Step1Answer;
    level?: Step2Answer;
    travelTime?: Step3Answer;
  }>({});

  const STEPS = [
    {
      question: t("onboardingQ1"),
      options: [
        { label: t("onboardingA1_weekday"), sub: t("onboardingA1_weekday_sub"), value: "weekday_evenings" as Step1Answer },
        { label: t("onboardingA1_weekends"), sub: t("onboardingA1_weekends_sub"), value: "weekends" as Step1Answer },
        { label: t("onboardingA1_anytime"), sub: t("onboardingA1_anytime_sub"), value: "anytime" as Step1Answer },
      ],
    },
    {
      question: t("onboardingQ2"),
      options: [
        { label: t("onboardingA2_casual"), sub: t("onboardingA2_casual_sub"), value: "casual" as Step2Answer },
        { label: t("onboardingA2_intermediate"), sub: t("onboardingA2_intermediate_sub"), value: "intermediate" as Step2Answer },
        { label: t("onboardingA2_competitive"), sub: t("onboardingA2_competitive_sub"), value: "competitive" as Step2Answer },
      ],
    },
    {
      question: t("onboardingQ3"),
      options: [
        { label: t("onboardingA3_10min"), sub: t("onboardingA3_10min_sub"), value: "10min" as Step3Answer },
        { label: t("onboardingA3_15min"), sub: t("onboardingA3_15min_sub"), value: "15min" as Step3Answer },
        { label: t("onboardingA3_any"), sub: t("onboardingA3_any_sub"), value: "any" as Step3Answer },
      ],
    },
  ];

  const current = STEPS[step];
  if (!current) return null;

  const handleSelect = (value: string) => {
    if (step === 0) {
      setAnswers((prev) => ({ ...prev, timeSlots: value as Step1Answer }));
      setStep(1);
    } else if (step === 1) {
      setAnswers((prev) => ({ ...prev, level: value as Step2Answer }));
      setStep(2);
    } else {
      onComplete({
        timeSlots: answers.timeSlots ?? "anytime",
        level: answers.level ?? "casual",
        travelTime: value as Step3Answer,
      });
    }
  };

  return (
    <div
      className="flex w-[min(280px,calc(100vw-3rem))] shrink-0 flex-col rounded-xl border border-card-border bg-card p-4 shadow-sm"
      style={{ minHeight: "200px" }}
    >
      {/* Progress bar */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < step ? "bg-primary" : i === step ? "bg-primary/60" : "bg-card-border"
            }`}
          />
        ))}
      </div>

      {/* Header: back + step counter */}
      <div className="mt-2 flex items-center gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted transition hover:bg-primary/8 hover:text-foreground active:scale-95"
            aria-label={t("onboardingBack")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
            {t("onboardingBack")}
          </button>
        )}
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {t("onboardingStep")} {step + 1} {t("onboardingOf")} {STEPS.length}
        </p>
      </div>

      <p className="mt-1.5 text-sm font-semibold leading-snug text-foreground">
        {current.question}
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {current.options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleSelect(opt.value)}
            className="flex items-center gap-2 rounded-lg border border-card-border bg-background px-3 py-2 text-left transition hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98]"
          >
            <span className="flex-1">
              <span className="block text-xs font-semibold text-foreground">{opt.label}</span>
              <span className="block text-[10px] text-muted">{opt.sub}</span>
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted" aria-hidden>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
