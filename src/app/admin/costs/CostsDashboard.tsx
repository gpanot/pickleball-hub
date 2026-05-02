"use client";

type TodayStats = {
  date: string;
  spend: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
};

type MonthStats = {
  label: string;
  spend: number;
  budget: number;
  calls: number;
  avgCostPerCall: number;
};

type HistoryRow = {
  date: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

function fmt$(n: number) {
  if (n < 0.0001 && n > 0) return "<$0.0001";
  return `$${n.toFixed(4)}`;
}

function fmtNum(n: number) {
  return n.toLocaleString("en-US");
}

function fmtModel(model: string) {
  if (model.includes("haiku")) return "Haiku 4.5";
  if (model.includes("sonnet")) return "Sonnet 4.6";
  if (model.includes("opus")) return "Opus 4.6";
  return model;
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function BudgetBar({ pct }: { pct: number }) {
  const clamped = Math.min(pct, 1);
  const color =
    clamped >= 1 ? "bg-red-500" : clamped >= 0.8 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
      <div
        className={`h-2 rounded-full transition-all ${color}`}
        style={{ width: `${Math.round(clamped * 100)}%` }}
      />
    </div>
  );
}

export function CostsDashboard({
  today,
  month,
  history,
}: {
  today: TodayStats;
  month: MonthStats;
  history: HistoryRow[];
}) {
  const budgetPct = month.budget > 0 ? month.spend / month.budget : 0;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-lg font-semibold">LLM Costs</h1>
        <p className="text-xs text-gray-500 mt-0.5">Claude API usage and spend tracking</p>
      </div>

      {/* Today */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Today</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Today's spend"
            value={fmt$(today.spend)}
          />
          <StatCard
            label="Input tokens"
            value={fmtNum(today.inputTokens)}
          />
          <StatCard
            label="Output tokens"
            value={fmtNum(today.outputTokens)}
          />
          <StatCard
            label="API calls"
            value={today.calls}
          />
        </div>
      </section>

      {/* This month */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          This month — {month.label}
        </h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-3xl font-semibold text-white">{fmt$(month.spend)}</span>
              <span className="text-gray-500 text-sm ml-2">of {fmt$(month.budget)} budget</span>
            </div>
            <span className={`text-sm font-medium ${budgetPct >= 1 ? "text-red-400" : budgetPct >= 0.8 ? "text-amber-400" : "text-emerald-400"}`}>
              {Math.round(budgetPct * 100)}%
            </span>
          </div>
          <BudgetBar pct={budgetPct} />
          <div className="flex gap-6 text-sm text-gray-400 pt-1">
            <span>Calls: <span className="text-gray-200">{fmtNum(month.calls)}</span></span>
            <span>Avg / call: <span className="text-gray-200">{fmt$(month.avgCostPerCall)}</span></span>
            <span>
              Budget left:{" "}
              <span className={budgetPct >= 1 ? "text-red-400" : "text-gray-200"}>
                {fmt$(Math.max(0, month.budget - month.spend))}
              </span>
            </span>
          </div>
        </div>
      </section>

      {/* History table */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Last 30 days
        </h2>
        {history.length === 0 ? (
          <div className="text-center py-12 text-gray-600 text-sm">No usage logs yet.</div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Date</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Model</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Calls</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Input</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Output</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Cost</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.date} className="border-b border-gray-800/60 last:border-0 hover:bg-gray-800/30 transition">
                    <td className="px-4 py-3 text-gray-300 font-mono text-xs">{row.date}</td>
                    <td className="px-4 py-3 text-gray-400">{fmtModel(row.model)}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{row.calls}</td>
                    <td className="px-4 py-3 text-right text-gray-400 tabular-nums">{fmtNum(row.inputTokens)}</td>
                    <td className="px-4 py-3 text-right text-gray-400 tabular-nums">{fmtNum(row.outputTokens)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-medium tabular-nums">{fmt$(row.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
