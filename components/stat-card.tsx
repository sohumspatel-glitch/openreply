/**
 * Stat Card
 *
 * Metric panel with label, value, and optional trend. These repeat in a grid,
 * so the surface is opaque — a backdrop-filter here would composite on every
 * frame the grid is on screen.
 */

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
}

export default function StatCard({ label, value, trend, trendUp }: StatCardProps) {
  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-hair sm:p-5">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-faint">
        {label}
      </p>
      {/* Tabular figures keep the numbers from shifting as a tile refreshes. */}
      <p className="mt-2 font-title text-[1.75rem] font-semibold leading-none tracking-[-0.02em] text-foreground tabular-nums">
        {value}
      </p>
      {trend && (
        <p
          className={`mt-2 text-xs font-medium ${trendUp ? "text-success" : "text-error"}`}
        >
          {trendUp ? "Up" : "Down"} {trend}
        </p>
      )}
    </div>
  );
}
