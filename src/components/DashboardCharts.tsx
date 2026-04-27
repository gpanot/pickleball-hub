"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { formatVND } from "@/lib/utils";

/** Measured box so Recharts get positive width/height (ResponsiveContainer breaks in nested flex). */
function RechartsAutoSize({
  height,
  className,
  children,
}: {
  height: number;
  className?: string;
  children: (size: { width: number; height: number }) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      setWidth(Math.max(0, Math.floor(w)));
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className ?? "w-full min-w-0"}
      style={{ height, minHeight: height }}
    >
      {width > 0 ? children({ width, height }) : null}
    </div>
  );
}

interface FillRateTrendProps {
  data: { date: string; avgFillRate: number; totalSessions: number }[];
}

interface MarketMedianCostChartProps {
  data: { date: string; medianCostPerHour: number }[];
}

/** Stored HCM-wide median session cost per hour (VND) by calendar day — same basis as session value scoring. */
export function MarketMedianCostChart({ data }: MarketMedianCostChartProps) {
  const formatted = [...data].map((d) => ({
    ...d,
    medianK: Math.round(d.medianCostPerHour / 1000),
  }));

  return (
    <RechartsAutoSize height={256} className="w-full min-w-0">
      {({ width, height }) => (
        <LineChart width={width} height={height} data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}k`} />
          <Tooltip
            formatter={(value) => [
              formatVND(Math.round(typeof value === "number" ? value : Number(value))),
              "Median / hr",
            ]}
            labelFormatter={(l) => `Date: ${l}`}
          />
          <Line
            type="monotone"
            dataKey="medianCostPerHour"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3 }}
            name="Median cost/hr"
          />
        </LineChart>
      )}
    </RechartsAutoSize>
  );
}

export function FillRateTrendChart({ data }: FillRateTrendProps) {
  const formatted = [...data].reverse().map((d) => ({
    ...d,
    fillPct: Math.round(d.avgFillRate * 100),
  }));

  return (
    <RechartsAutoSize height={256} className="w-full min-w-0">
      {({ width, height }) => (
        <LineChart width={width} height={height} data={formatted}>
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
      )}
    </RechartsAutoSize>
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
    <RechartsAutoSize height={256} className="w-full min-w-0">
      {({ width, height }) => (
        <BarChart width={width} height={height} data={formatted}>
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
      )}
    </RechartsAutoSize>
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
    <RechartsAutoSize height={256} className="w-full min-w-0">
      {({ width, height }) => (
        <BarChart width={width} height={height} data={formatted}>
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
      )}
    </RechartsAutoSize>
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
    <RechartsAutoSize height={256} className="w-full min-w-0">
      {({ width, height }) => (
        <BarChart width={width} height={height} data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="slot" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}k`} />
          <Tooltip formatter={(value) => [`${value}k VND`]} />
          <Bar dataKey="priceK" name="Market Avg" fill="#94a3b8" radius={[4, 4, 0, 0]} />
          <Bar dataKey="myPriceK" name="Your Price" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      )}
    </RechartsAutoSize>
  );
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface WeeklyDistributionProps {
  data: { day: number; label: string; sessions: number; booked: number; capacity: number }[];
}

export function WeeklyDistributionChart({ data }: WeeklyDistributionProps) {
  return (
    <RechartsAutoSize height={288} className="w-full min-w-0">
      {({ width, height }) => (
        <BarChart width={width} height={height} data={data} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="sessions" name="Sessions" fill="#6366f1" radius={[3, 3, 0, 0]} />
          <Bar dataKey="booked" name="Players Booked" fill="#10b981" radius={[3, 3, 0, 0]} />
          <Bar dataKey="capacity" name="Total Capacity" fill="#94a3b8" radius={[3, 3, 0, 0]} />
        </BarChart>
      )}
    </RechartsAutoSize>
  );
}

interface HourlyStatsDistributionProps {
  data: { hour: string; sessions: number; booked: number; capacity: number }[];
}

export function HourlyStatsDistributionChart({ data }: HourlyStatsDistributionProps) {
  return (
    <RechartsAutoSize height={288} className="w-full min-w-0">
      {({ width, height }) => (
        <BarChart width={width} height={height} data={data} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="sessions" name="Sessions" fill="#6366f1" radius={[3, 3, 0, 0]} />
          <Bar dataKey="booked" name="Players Booked" fill="#10b981" radius={[3, 3, 0, 0]} />
          <Bar dataKey="capacity" name="Total Capacity" fill="#94a3b8" radius={[3, 3, 0, 0]} />
        </BarChart>
      )}
    </RechartsAutoSize>
  );
}

export { DAY_LABELS };
