"use client";

/**
 * Overview header
 *
 * Title, what the range currently covers, and the two controls that change it.
 * It stays mounted while a range reloads so the controls never disappear from
 * under the pointer mid-request.
 */

import AccountSelect from "@/components/account-select";
import type { OverviewResponse } from "@/app/api/instagram/overview/route";

// A day window, not a post count: it drives the chart, the account totals and
// which posts the grid shows, so one control governs the whole page. 90 is the
// ceiling because that is how far Instagram's daily insights reach; "All time"
// still charts 90 days but shows every post.
export const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

export function rangeLabel(range: string): string {
  const match = RANGE_OPTIONS.find((o) => o.value === range);
  if (!match) return "this range";
  return range === "all" ? "all time" : match.label.replace("Last ", "the last ");
}

interface OverviewHeaderProps {
  data: OverviewResponse | null;
  loading: boolean;
  selectedAccountId: string;
  onAccountChange: (accountId: string) => void;
  range: string;
  onRangeChange: (range: string) => void;
}

export default function OverviewHeader({
  data,
  loading,
  selectedAccountId,
  onAccountChange,
  range,
  onRangeChange,
}: OverviewHeaderProps) {
  const accounts = data?.accounts ?? [];
  const followers = data?.followers ?? null;

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="font-title text-2xl font-semibold tracking-tight text-foreground">
          Overview
        </h1>
        <p className="mt-1 text-sm text-muted">
          {data ? (
            <>
              {data.totals.posts.toLocaleString()} post
              {data.totals.posts === 1 ? "" : "s"} published in{" "}
              {rangeLabel(range)} from @{data.account.username}
              {data.truncated ? ` (capped at ${data.totals.posts})` : ""}
            </>
          ) : loading ? (
            "Loading posts…"
          ) : (
            "No posts loaded"
          )}
        </p>
        {followers !== null && (
          // Kept out of the tile row: that row sums the selected posts, whereas
          // this is a current, account-level total.
          <p className="mt-3">
            <span className="inline-flex items-center rounded-pill border border-accent-rim bg-accent-tint px-2.5 py-1 text-xs font-medium text-accent-text">
              {followers.toLocaleString()} followers
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-faint">
            Range
          </span>
          <select
            value={range}
            onChange={(event) => onRangeChange(event.target.value)}
            className="min-w-40 rounded-btn border border-border bg-surface-field px-3 py-2 text-sm text-foreground motion-safe:transition-colors hover:border-border-firm"
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {accounts.length > 1 && (
          <AccountSelect
            accounts={accounts.map((account) => ({
              id: account.id,
              username: account.username,
              // Filler: the overview payload carries no Instagram id, and the
              // select never reads this field.
              instagramId: account.id,
            }))}
            value={selectedAccountId}
            onChange={onAccountChange}
          />
        )}
      </div>
    </div>
  );
}
