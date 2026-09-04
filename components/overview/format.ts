/**
 * Overview formatters
 *
 * Compact where the grid is dense, exact in the detail panel. `null` always
 * renders as a dash and never as a zero: the payload uses it for "not
 * applicable" (an image has no views) as often as for "we could not read it",
 * and a zero would read as a fact in both cases.
 */

const COMPACT = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** 12.4K / 1.2M. Values under a thousand come through unchanged. */
export function formatCompact(n: number | null): string {
  return n === null ? "—" : COMPACT.format(n);
}

/** Every digit, for the detail panel. */
export function formatExact(n: number | null): string {
  return n === null ? "—" : n.toLocaleString();
}

/** A 0–1 ratio as a percentage. */
export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

/**
 * Card-sized date. The year only appears when it is not the current one, so an
 * all-time range stays unambiguous without padding every recent card.
 */
export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = "numeric";
  return date.toLocaleDateString(undefined, options);
}

/** Exact posting moment, in the reader's timezone. */
export function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  });
}
