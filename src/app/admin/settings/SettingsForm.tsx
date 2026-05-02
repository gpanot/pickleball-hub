"use client";

import { useState, useTransition } from "react";

type Settings = {
  id: string;
  llmModel: string;
  temperature: number;
  maxTokens: number;
  monthlyBudgetUsd: number;
  updatedAt: string;
};

const MODELS = [
  { value: "claude-haiku-4-5-20251001",  label: "Claude Haiku 4.5 — fast, cheapest ($0.80/$4.00 per M)" },
  { value: "claude-sonnet-4-6-20251001", label: "Claude Sonnet 4.6 — balanced ($3.00/$15.00 per M)" },
  { value: "claude-opus-4-6-20251001",   label: "Claude Opus 4.6 — best quality ($15.00/$75.00 per M)" },
];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-300">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">{title}</h2>
      {children}
    </div>
  );
}

export function SettingsForm({ settings: initial }: { settings: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
  }

  function handleSave() {
    startTransition(async () => {
      setSaved(false);
      setError(null);
      try {
        const res = await fetch("/api/admin/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            llmModel: settings.llmModel,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
            monthlyBudgetUsd: settings.monthlyBudgetUsd,
          }),
        });
        if (!res.ok) {
          const data = await res.json() as { error: string };
          setError(data.error ?? "Failed to save");
          return;
        }
        const data = await res.json() as { settings: Settings };
        setSettings(data.settings);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (e) {
        setError(String(e));
      }
    });
  }

  return (
    <div className="space-y-6">
      <Section title="LLM Model">
        <Field
          label="Model"
          hint="Haiku is recommended for daily content generation — fast and cost-effective."
        >
          <select
            value={settings.llmModel}
            onChange={(e) => update("llmModel", e.target.value)}
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </Field>

        <Field
          label={`Temperature — ${settings.temperature.toFixed(2)}`}
          hint="Lower = more predictable. 0.7 is a good default for marketing copy."
        >
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.temperature}
            onChange={(e) => update("temperature", parseFloat(e.target.value))}
            className="w-full accent-emerald-500"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-0.5">
            <span>0.0 — precise</span>
            <span>1.0 — creative</span>
          </div>
        </Field>

        <Field
          label="Max tokens"
          hint="1000 is plenty for three short Vietnamese posts."
        >
          <input
            type="number"
            min={100}
            max={8192}
            step={100}
            value={settings.maxTokens}
            onChange={(e) => update("maxTokens", parseInt(e.target.value) || 1000)}
            className="w-40 rounded-lg bg-gray-800 border border-gray-700 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
          />
        </Field>
      </Section>

      <Section title="Monthly Budget">
        <Field
          label="Monthly LLM budget (USD)"
          hint="Default $5 covers daily Haiku calls for the entire year. At $0.002/call × 60 calls/month = $0.12."
        >
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm">$</span>
            <input
              type="number"
              min={0}
              max={1000}
              step={0.5}
              value={settings.monthlyBudgetUsd}
              onChange={(e) => update("monthlyBudgetUsd", parseFloat(e.target.value) || 5)}
              className="w-32 rounded-lg bg-gray-800 border border-gray-700 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
            />
            <span className="text-gray-500 text-sm">USD / month</span>
          </div>
        </Field>
      </Section>

      <div className="flex items-center gap-3">
        <button
          disabled={isPending}
          onClick={handleSave}
          className="px-5 py-2.5 text-sm font-medium rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white transition disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save Settings"}
        </button>
        {saved && <span className="text-sm text-emerald-400">Saved.</span>}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>

      {settings.updatedAt && (
        <p className="text-xs text-gray-600">
          Last saved: {new Date(settings.updatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
