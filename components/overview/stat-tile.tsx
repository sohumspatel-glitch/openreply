/**
 * Overview stat tile
 *
 * Deliberately opaque: these repeat across a grid, so nothing here gets a
 * backdrop filter. Depth comes from a hairline and a quiet shadow instead.
 */

interface StatTileProps {
  label: string;
  value: string;
  /** Copper for the one figure that anchors the row. Never for the whole set. */
  accent?: boolean;
  /** A clarifier for a figure that does not mean what its label implies. */
  hint?: string;
}

export default function StatTile({ label, value, accent, hint }: StatTileProps) {
  return (
    <div className="rounded-panel border border-border bg-surface p-4 shadow-hair">
      <p className="text-xs font-medium uppercase tracking-wide text-faint">
        {label}
      </p>
      <p
        className={`mt-2 font-title text-2xl font-semibold tracking-tight tabular-nums ${
          accent ? "text-accent" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="rounded-panel border border-border bg-surface p-4 shadow-hair">
      <div className="h-3 w-16 rounded-control bg-surface-warm motion-safe:animate-pulse" />
      <div className="mt-3 h-6 w-20 rounded-control bg-surface-warm motion-safe:animate-pulse" />
    </div>
  );
}
