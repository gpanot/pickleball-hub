"use client";

import { useState, useEffect, useTransition } from "react";

type AiChatSettings = {
  model: string;
  contextHours: number;
  maxVenues: number;
  maxClubs: number;
  maxCostPerMessageUsd: number;
  dailyCostAlertUsd: number;
  playerFacingEnabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
};

type PeriodCost = {
  total: number;
  player: number;
  admin: number;
  messageCount: { total: number; player: number; admin: number };
};

type DailyCost = {
  today: PeriodCost;
  thisWeek: PeriodCost;
  thisMonth: PeriodCost;
};

const AI_CHAT_MODELS = [
  {
    value: "deepseek-chat",
    label: "DeepSeek V3 — Fastest · ~$0.001/msg",
    hint: "Recommended for players",
  },
  {
    value: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5 — Fast · ~$0.086/msg",
    hint: "Anthropic — good balance",
  },
  {
    value: "claude-sonnet-4-6-20251001",
    label: "Claude Sonnet 4.6 — Smart · ~$0.17/msg",
    hint: "Admin testing only",
  },
];

const CONTEXT_HOURS_OPTIONS = [
  { value: 24, label: "24 hours" },
  { value: 48, label: "48 hours" },
  { value: 168, label: "7 days" },
];

function formatCost(usd: number) {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? "bg-emerald-600" : "bg-gray-700"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
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

export function AiChatSettingsSection({
  initial,
}: {
  initial: AiChatSettings;
}) {
  const [settings, setSettings] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [costs, setCosts] = useState<DailyCost | null>(null);
  const [costsLoading, setCostsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/ai-assistant/daily-cost")
      .then((r) => r.json())
      .then((d: DailyCost) => setCosts(d))
      .catch(() => {})
      .finally(() => setCostsLoading(false));
  }, []);

  function update<K extends keyof AiChatSettings>(key: K, value: AiChatSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
  }

  function handleSave() {
    startTransition(async () => {
      setSaved(false);
      setError(null);
      try {
        const res = await fetch("/api/admin/ai-chat-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: settings.model,
            contextHours: settings.contextHours,
            maxVenues: settings.maxVenues,
            maxClubs: settings.maxClubs,
            maxCostPerMessageUsd: settings.maxCostPerMessageUsd,
            dailyCostAlertUsd: settings.dailyCostAlertUsd,
            playerFacingEnabled: settings.playerFacingEnabled,
          }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error: string };
          setError(data.error ?? "Failed to save");
          return;
        }
        const data = (await res.json()) as { settings: AiChatSettings };
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
      {/* Cost summary */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-6 py-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          AI Chat Usage
        </p>
        {costsLoading ? (
          <p className="text-xs text-gray-600">Loading…</p>
        ) : costs ? (
          <div className="grid grid-cols-3 gap-6">
            {(
              [
                { label: "Today", data: costs.today },
                { label: "This week", data: costs.thisWeek },
                { label: "This month", data: costs.thisMonth },
              ] as const
            ).map(({ label, data }) => (
              <div key={label}>
                <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-sm font-semibold text-white">{formatCost(data.total)}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {data.messageCount.total} msg
                  {data.messageCount.total !== 1 ? "s" : ""}
                </p>
                {data.messageCount.total > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {data.messageCount.player > 0 && (
                      <p className="text-[10px] text-emerald-700">
                        Players: {formatCost(data.player)} · {data.messageCount.player}
                      </p>
                    )}
                    {data.messageCount.admin > 0 && (
                      <p className="text-[10px] text-gray-600">
                        Admin: {formatCost(data.admin)} · {data.messageCount.admin}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-600">No data</p>
        )}
      </div>

      {/* Model */}
      <Section title="Model">
        <Field label="Model" hint="Controls intelligence vs cost trade-off for player-facing chat.">
          <select
            value={settings.model}
            onChange={(e) => update("model", e.target.value)}
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
          >
            {AI_CHAT_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label} — {m.hint}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      {/* Context window */}
      <Section title="Context Window">
        <Field
          label="Session lookback"
          hint="How far ahead to look for upcoming sessions to include in the AI's context."
        >
          <select
            value={settings.contextHours}
            onChange={(e) => update("contextHours", parseInt(e.target.value))}
            className="w-48 rounded-lg bg-gray-800 border border-gray-700 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
          >
            {CONTEXT_HOURS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-gray-300">Sessions in context</p>
          <p className="text-sm text-gray-400">
            All sessions within the lookback window — no cap. With compressed format each session uses ~15 tokens.
          </p>
        </div>

        <Field
          label={`Max venues in context — ${settings.maxVenues}`}
          hint="Top N venues by activity in the last 90 days."
        >
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={settings.maxVenues}
            onChange={(e) => update("maxVenues", parseInt(e.target.value))}
            className="w-full accent-emerald-500"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-0.5">
            <span>10</span>
            <span>100</span>
          </div>
        </Field>

        <Field
          label={`Max clubs in context — ${settings.maxClubs}`}
          hint="Top N clubs by active player count in the last 90 days."
        >
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={settings.maxClubs}
            onChange={(e) => update("maxClubs", parseInt(e.target.value))}
            className="w-full accent-emerald-500"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-0.5">
            <span>10</span>
            <span>100</span>
          </div>
        </Field>
      </Section>

      {/* Cost controls */}
      <Section title="Cost Controls">
        <Field
          label="Max cost per message (USD)"
          hint="Logs a console warning when a single message exceeds this amount. Does not block the response."
        >
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">$</span>
            <input
              type="number"
              min={0}
              max={10}
              step={0.01}
              value={settings.maxCostPerMessageUsd}
              onChange={(e) =>
                update("maxCostPerMessageUsd", parseFloat(e.target.value) || 0.05)
              }
              className="w-28 rounded-lg bg-gray-800 border border-gray-700 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
            />
          </div>
        </Field>

        <Field
          label="Daily cost alert threshold (USD)"
          hint="When daily spend exceeds this amount, a warning is logged. Future: push notification."
        >
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">$</span>
            <input
              type="number"
              min={0}
              max={1000}
              step={0.5}
              value={settings.dailyCostAlertUsd}
              onChange={(e) =>
                update("dailyCostAlertUsd", parseFloat(e.target.value) || 5)
              }
              className="w-28 rounded-lg bg-gray-800 border border-gray-700 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
            />
            <span className="text-gray-500 text-sm">USD / day</span>
          </div>
        </Field>
      </Section>

      {/* Player-facing toggle */}
      <Section title="Visibility">
        <Field
          label="Show AI assistant on heatmap page"
          hint={
            settings.playerFacingEnabled
              ? "ON — floating chat button visible to all players."
              : "OFF — chat widget hidden from players. Admin testing only."
          }
        >
          <div className="flex items-center gap-3">
            <Toggle
              checked={settings.playerFacingEnabled}
              onChange={(v) => update("playerFacingEnabled", v)}
            />
            <span
              className={`text-sm font-medium ${
                settings.playerFacingEnabled ? "text-emerald-400" : "text-gray-500"
              }`}
            >
              {settings.playerFacingEnabled ? "ON" : "OFF"}
            </span>
          </div>
        </Field>
      </Section>

      {/* Save bar */}
      <div className="flex items-center gap-3">
        <button
          disabled={isPending}
          onClick={handleSave}
          className="px-5 py-2.5 text-sm font-medium rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white transition disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save AI Chat Settings"}
        </button>
        {saved && <span className="text-sm text-emerald-400">Saved.</span>}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>

      {settings.updatedAt && (
        <p className="text-xs text-gray-600">
          Last saved:{" "}
          {new Date(settings.updatedAt).toLocaleString("en-US", {
            timeZone: "Asia/Ho_Chi_Minh",
          })}
          {settings.updatedBy ? ` by ${settings.updatedBy}` : ""}
        </p>
      )}
    </div>
  );
}
