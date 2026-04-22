"use client";

import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface FillRateTrendProps {
  data: { date: string; avgFillRate: number; totalSessions: number }[];
}

export function FillRateTrendChart({ data }: FillRateTrendProps) {
  const formatted = [...data].reverse().map((d) => ({
    ...d,
    fillPct: Math.round(d.avgFillRate * 100),
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            formatter={(value) => [`${value}%`, "Fill Rate"]}
            labelFormatter={(l) => `Date: ${l}`}
          />
          <Line
            type="monotone"
            dataKey="fillPct"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface RevenueChartProps {
  data: { date: string; revenueEstimate: number }[];
}

export function RevenueChart({ data }: RevenueChartProps) {
  const formatted = [...data].reverse().map((d) => ({
    ...d,
    revenueK: Math.round(d.revenueEstimate / 1000),
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}k`} />
          <Tooltip
            formatter={(value) => [`${value}k VND`, "Revenue"]}
            labelFormatter={(l) => `Date: ${l}`}
          />
          <Bar dataKey="revenueK" radius={[4, 4, 0, 0]}>
            {formatted.map((_, i) => (
              <Cell key={i} fill="#10b981" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface HourlyUtilizationProps {
  data: { hour: number; sessions: number; totalPlayers: number }[];
}

export function HourlyUtilizationChart({ data }: HourlyUtilizationProps) {
  const formatted = data.map((d) => ({
    ...d,
    label: `${d.hour.toString().padStart(2, "0")}:00`,
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="sessions" name="Sessions" radius={[4, 4, 0, 0]}>
            {formatted.map((d, i) => (
              <Cell key={i} fill={d.sessions > 0 ? "#10b981" : "#e5e7eb"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface CompetitorPriceChartProps {
  myAvgPrice: number;
  competitorPrices: { slot: string; avgPrice: number; count: number }[];
}

export function CompetitorPriceChart({ myAvgPrice, competitorPrices }: CompetitorPriceChartProps) {
  const data = competitorPrices.map((c) => ({
    ...c,
    myPrice: myAvgPrice,
    priceK: Math.round(c.avgPrice / 1000),
    myPriceK: Math.round(myAvgPrice / 1000),
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="slot" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}k`} />
          <Tooltip formatter={(value) => [`${value}k VND`]} />
          <Bar dataKey="priceK" name="Market Avg" fill="#94a3b8" radius={[4, 4, 0, 0]} />
          <Bar dataKey="myPriceK" name="Your Price" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
