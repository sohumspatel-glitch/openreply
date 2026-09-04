"use client";

/**
 * Performance over time.
 *
 * Two kinds of series live in this one chart, and the distinction is real
 * rather than cosmetic:
 *
 *  - Followers and reach are TRUE DAILY SERIES. Instagram returns one value per
 *    day for these, going back 90 days. They render as areas.
 *  - Likes, comments, shares, saves and views have NO daily breakdown available
 *    from Instagram at all. The account-level API returns them only as a total
 *    over a window. What is plotted instead is per-post: each post's lifetime
 *    count, summed onto the day it was published. They render as bars.
 *
 * So a bar answers "how much have the posts I published that day earned, ever",
 * not "how much engagement happened that day". Those are different questions,
 * and the caption under the chart says which one you are looking at, because a
 * reader who assumes the second will misread every spike.
 */

import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompact } from "@/components/overview/format";
import type {
  OverviewPost,
  OverviewResponse,
} from "@/app/api/instagram/overview/route";
import type { FollowerHistoryPoint } from "@/lib/reports/follower-history";

// Recharts writes these onto SVG presentation attributes, which resolve var()
// the same way CSS does, so the chart stays on the theme tokens.
const SERIES = "var(--color-accent)";
const GRID = "var(--color-border-soft)";
const AXIS = "var(--color-muted)";
const CURSOR = "var(--color-border-firm)";

type Kind = "daily" | "perPost";

interface MetricDef {
  key: string;
  label: string;
  kind: Kind;
  /** Which OverviewPost field to sum, for per-post metrics. */
  field?: keyof OverviewPost;
}

const METRICS: MetricDef[] = [
  { key: "followers", label: "Followers", kind: "daily" },
  { key: "reach", label: "Reach", kind: "daily" },
  { key: "views", label: "Views", kind: "perPost", field: "views" },
  { key: "likes", label: "Likes", kind: "perPost", field: "likes" },
  { key: "comments", label: "Comments", kind: "perPost", field: "comments" },
  { key: "shares", label: "Shares", kind: "perPost", field: "shares" },
  { key: "saved", label: "Saves", kind: "perPost", field: "saved" },
];

interface Row {
  date: string;
  value: number;
  /** Posts published that day, shown in the per-post tooltip. */
  posts?: number;
}

function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Sum a post field onto each post's publish day, oldest first. */
function bucketByPublishDay(posts: OverviewPost[], field: keyof OverviewPost): Row[] {
  const byDay = new Map<string, Row>();
  for (const post of posts) {
    const value = post[field];
    if (typeof value !== "number") continue;
    const day = post.timestamp.slice(0, 10);
    const row = byDay.get(day) ?? { date: day, value: 0, posts: 0 };
    row.value += value;
    row.posts = (row.posts ?? 0) + 1;
    byDay.set(day, row);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

interface PerformanceChartProps {
  followerHistory: FollowerHistoryPoint[];
  reachHistory: OverviewResponse["reachHistory"];
  posts: OverviewPost[];
  followers: number | null;
  rangeLabel: string;
}

export default function PerformanceChart({
  followerHistory,
  reachHistory,
  posts,
  followers,
  rangeLabel,
}: PerformanceChartProps) {
  const [metricKey, setMetricKey] = useState("followers");
  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];

  const rows = useMemo<Row[]>(() => {
    if (metric.key === "followers") {
      return followerHistory.map((p) => ({ date: p.date, value: p.followers }));
    }
    if (metric.key === "reach") {
      return reachHistory.map((p) => ({ date: p.date, value: p.value }));
    }
    return bucketByPublishDay(posts, metric.field as keyof OverviewPost);
  }, [metric, followerHistory, reachHistory, posts]);

  // No rows means the metric is unavailable rather than zero, and saying so
  // beats drawing a flat line along the axis.
  const empty = rows.length === 0;
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const net = rows.length > 1 ? rows[rows.length - 1].value - rows[0].value : 0;

  return (
    <section className="panel rounded-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-title font-semibold text-foreground">
            {metric.label} over time
          </h2>
          <p className="mt-1 text-body-sm text-muted">
            {metric.key === "followers" ? (
              <>
                {followers !== null ? (
                  <span className="font-medium text-foreground">
                    {followers.toLocaleString()} now
                  </span>
                ) : null}
                {followers !== null && rows.length > 1 ? " · " : null}
                {rows.length > 1 ? (
                  <span
                    className={
                      net >= 0
                        ? "font-medium text-success"
                        : "font-medium text-error"
                    }
                  >
                    {net >= 0 ? "+" : ""}
                    {net.toLocaleString()}
                  </span>
                ) : null}
                {rows.length > 1 ? " over " + rangeLabel : null}
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">
                  {formatCompact(total)}
                </span>{" "}
                {metric.kind === "daily"
                  ? "over " + rangeLabel
                  : "from posts published in " + rangeLabel}
              </>
            )}
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Chart metric"
          className="flex flex-wrap gap-1 rounded-btn bg-surface-warm p-1"
        >
          {METRICS.map((m) => {
            const active = m.key === metric.key;
            return (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMetricKey(m.key)}
                className={
                  "rounded-control px-2.5 py-1 text-body-xs font-medium motion-safe:transition-colors " +
                  (active
                    ? "bg-surface text-foreground shadow-hair"
                    : "text-muted hover:text-foreground")
                }
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {empty ? (
        <p className="mt-8 mb-6 text-center text-body-sm text-muted">
          Instagram returned no {metric.label.toLowerCase()} data for this range.
        </p>
      ) : (
        <div className="mt-5 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={rows}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={SERIES} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={{ fill: AXIS, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tickFormatter={(v: number) => formatCompact(v)}
                tick={{ fill: AXIS, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={46}
                // Followers is a level, not a count from zero. Anchoring it at
                // zero flattens the whole line into a strip along the top.
                domain={
                  metric.key === "followers"
                    ? ["dataMin", "dataMax"]
                    : [0, "auto"]
                }
              />
              <Tooltip
                cursor={{ stroke: CURSOR, fill: "var(--color-surface-warm)" }}
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-panel)",
                  fontSize: 12,
                  color: "var(--color-foreground)",
                }}
                labelFormatter={(d) => shortDate(String(d))}
                formatter={(value, _name, item) => {
                  const n = typeof value === "number" ? value : Number(value ?? 0);
                  const dayPosts = (item?.payload as Row | undefined)?.posts;
                  const text = dayPosts
                    ? n.toLocaleString() +
                      " · " +
                      dayPosts +
                      (dayPosts === 1 ? " post" : " posts")
                    : n.toLocaleString();
                  return [text, metric.label];
                }}
              />
              {metric.kind === "daily" ? (
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={SERIES}
                  strokeWidth={2}
                  fill="url(#perfFill)"
                  dot={false}
                  isAnimationActive={false}
                />
              ) : (
                <Bar
                  dataKey="value"
                  fill={SERIES}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={26}
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-3 border-t border-border-soft pt-3 text-body-xs text-faint">
        {metric.kind === "daily"
          ? "A true daily series from Instagram account insights, available for the last 90 days."
          : "Instagram publishes no daily breakdown for this metric, so each bar is the lifetime total of the posts published that day, not activity on that day."}
      </p>
    </section>
  );
}
