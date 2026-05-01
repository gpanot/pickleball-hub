"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerPreferences } from "@/store/profileStore";
import { useI18n } from "@/lib/i18n";

type Step1Answer = PlayerPreferences["timeSlots"];
type Step2Answer = PlayerPreferences["level"];
type Step3Answer = PlayerPreferences["travelTime"];

interface OnboardingQnAProps {
  onComplete: (prefs: Omit<PlayerPreferences, "clickedSessions" | "visitCount">) => void;
}

function SubOptions({
  options,
  onSelect,
}: {
  options: { label: string; sub: string; value: string }[];
  onSelect: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      ref={ref}
      className="flex flex-col gap-1.5 overflow-hidden pl-3 transition-all duration-200 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-6px)",
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(opt.value)}
          className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-left transition hover:border-primary/60 hover:bg-primary/10 active:scale-[0.98]"
        >
          <span className="flex-1">
            <span className="block text-xs font-semibold text-foreground">{opt.label}</span>
            <span className="block text-[10px] text-muted">{opt.sub}</span>
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-primary/60"
            aria-hidden
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      ))}
    </div>
  );
}

export function OnboardingQnA({ onComplete }: OnboardingQnAProps) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [otherExpanded, setOtherExpanded] = useState(false);
  const [answers, setAnswers] = useState<{
    timeSlots?: Step1Answer;
    level?: Step2Answer;
    travelTime?: Step3Answer;
  }>({});

  const TOTAL_STEPS = 3;

  const STEP1_TOP = [
    {
      label: t("onboardingA1_weekday"),
      sub: t("onboardingA1_weekday_sub"),
      value: "weekday_evenings" as Step1Answer,
      expandable: false,
    },
    {
      label: t("onboardingA1_weekends"),
      sub: t("onboardingA1_weekends_sub"),
      value: "weekends" as Step1Answer,
      expandable: false,
    },
    {
      label: t("onboardingA1_other"),
      sub: t("onboardingA1_other_sub"),
      value: "other" as const,
      expandable: true,
    },
  ];

  const STEP1_SUB = [
    {
      label: t("onboardingA1_weekday_mornings"),
      sub: t("onboardingA1_weekday_mornings_sub"),
      value: "weekday_mornings" as Step1Answer,
    },
    {
      label: t("onboardingA1_weekday_afternoons"),
      sub: t("onboardingA1_weekday_afternoons_sub"),
      value: "weekday_afternoons" as Step1Answer,
    },
    {
      label: t("onboardingA1_weekend_evenings"),
      sub: t("onboardingA1_weekend_evenings_sub"),
      value: "weekend_evenings" as Step1Answer,
    },
  ];

  const STEP2 = [
    { label: t("onboardingA2_casual"), sub: t("onboardingA2_casual_sub"), value: "casual" as Step2Answer },
    { label: t("onboardingA2_intermediate"), sub: t("onboardingA2_intermediate_sub"), value: "intermediate" as Step2Answer },
    { label: t("onboardingA2_competitive"), sub: t("onboardingA2_competitive_sub"), value: "competitive" as Step2Answer },
  ];

  const STEP3 = [
    { label: t("onboardingA3_10min"), sub: t("onboardingA3_10min_sub"), value: "10min" as Step3Answer },
    { label: t("onboardingA3_15min"), sub: t("onboardingA3_15min_sub"), value: "15min" as Step3Answer },
    { label: t("onboardingA3_any"), sub: t("onboardingA3_any_sub"), value: "any" as Step3Answer },
  ];

  const handleStep1Select = (value: string) => {
    if (value === "other") {
      setOtherExpanded(true);
      return;
    }
    setOtherExpanded(false);
    setAnswers((prev) => ({ ...prev, timeSlots: value as Step1Answer }));
    setStep(1);
  };

  const handleStep2Select = (value: string) => {
    setAnswers((prev) => ({ ...prev, level: value as Step2Answer }));
    setStep(2);
  };

  const handleStep3Select = (value: string) => {
    onComplete({
      timeSlots: answers.timeSlots ?? "weekday_evenings",
      level: answers.level ?? "casual",
      travelTime: value as Step3Answer,
    });
  };

  const handleBack = () => {
    if (step === 0 && otherExpanded) {
      setOtherExpanded(false);
    } else {
      setStep((s) => Math.max(0, s - 1));
      setOtherExpanded(false);
    }
  };

  const showBack = step > 0 || otherExpanded;

  return (
    <div
      className="flex w-[min(280px,calc(100vw-3rem))] shrink-0 flex-col rounded-xl border border-card-border bg-card p-4 shadow-sm"
      style={{ minHeight: "200px" }}
    >
      {/* Progress bar */}
      <div className="flex items-center gap-1.5">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
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
        {showBack && (
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted transition hover:bg-primary/8 hover:text-foreground active:scale-95"
            aria-label={t("onboardingBack")}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            {t("onboardingBack")}
          </button>
        )}
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {t("onboardingStep")} {step + 1} {t("onboardingOf")} {TOTAL_STEPS}
        </p>
      </div>

      {/* Step 0 — time slots */}
      {step === 0 && (
        <>
          <p className="mt-1.5 text-sm font-semibold leading-snug text-foreground">
            {t("onboardingQ1")}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {STEP1_TOP.map((opt) => (
              <div key={opt.value}>
                <button
                  type="button"
                  onClick={() => handleStep1Select(opt.value)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition active:scale-[0.98] ${
                    opt.value === "other" && otherExpanded
                      ? "border-primary/50 bg-primary/8"
                      : "border-card-border bg-background hover:border-primary/50 hover:bg-primary/5"
                  }`}
                >
                  <span className="flex-1">
                    <span className="block text-xs font-semibold text-foreground">{opt.label}</span>
                    <span className="block text-[10px] text-muted">{opt.sub}</span>
                  </span>
                  {opt.expandable ? (
                    /* "+" icon for expand, rotates to "×" when open */
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`shrink-0 text-muted transition-transform duration-200 ${
                        otherExpanded ? "rotate-45" : ""
                      }`}
                      aria-hidden
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  ) : (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 text-muted"
                      aria-hidden
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  )}
                </button>

                {/* Inline sub-options — only under "Other times" */}
                {opt.expandable && otherExpanded && (
                  <div className="mt-1.5">
                    <SubOptions options={STEP1_SUB} onSelect={handleStep1Select} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Step 1 — level */}
      {step === 1 && (
        <>
          <p className="mt-1.5 text-sm font-semibold leading-snug text-foreground">
            {t("onboardingQ2")}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {STEP2.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleStep2Select(opt.value)}
                className="flex items-center gap-2 rounded-lg border border-card-border bg-background px-3 py-2 text-left transition hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98]"
              >
                <span className="flex-1">
                  <span className="block text-xs font-semibold text-foreground">{opt.label}</span>
                  <span className="block text-[10px] text-muted">{opt.sub}</span>
                </span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-muted"
                  aria-hidden
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Step 2 — travel time */}
      {step === 2 && (
        <>
          <p className="mt-1.5 text-sm font-semibold leading-snug text-foreground">
            {t("onboardingQ3")}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {STEP3.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleStep3Select(opt.value)}
                className="flex items-center gap-2 rounded-lg border border-card-border bg-background px-3 py-2 text-left transition hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98]"
              >
                <span className="flex-1">
                  <span className="block text-xs font-semibold text-foreground">{opt.label}</span>
                  <span className="block text-[10px] text-muted">{opt.sub}</span>
                </span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-muted"
                  aria-hidden
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
