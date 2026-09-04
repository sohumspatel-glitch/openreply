"use client";

/**
 * Post grid toolbar
 *
 * Sort, media-type filter and caption search, all client-side over the posts
 * already in memory — changing any of them never re-hits the API. The count is
 * announced politely so a keyboard user filtering by caption hears the result
 * without leaving the field.
 */

import {
  ALL_MEDIA_TYPES,
  SORT_OPTIONS,
  type SortKey,
} from "@/components/overview/post-analytics";

const CONTROL_CLASS =
  "rounded-btn border border-border bg-surface px-3 py-2 text-sm text-foreground motion-safe:transition-colors hover:border-border-firm";

interface OverviewToolbarProps {
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  mediaType: string;
  mediaTypes: string[];
  onMediaTypeChange: (mediaType: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  shown: number;
  total: number;
  onReset: () => void;
}

export default function OverviewToolbar({
  sort,
  onSortChange,
  mediaType,
  mediaTypes,
  onMediaTypeChange,
  query,
  onQueryChange,
  shown,
  total,
  onReset,
}: OverviewToolbarProps) {
  const filtered = mediaType !== ALL_MEDIA_TYPES || query.trim() !== "";

  return (
    <div className="flex flex-col gap-3 rounded-panel border border-border bg-surface-warm p-3 lg:flex-row lg:items-center">
      <div className="relative min-w-0 flex-1">
        <label htmlFor="post-search" className="sr-only">
          Search captions
        </label>
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        >
          <circle
            cx="7"
            cy="7"
            r="4.25"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M10.5 10.5 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <input
          id="post-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search captions"
          className={`${CONTROL_CLASS} w-full pl-9`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-faint">
            Type
          </span>
          <select
            value={mediaType}
            onChange={(event) => onMediaTypeChange(event.target.value)}
            className={CONTROL_CLASS}
          >
            <option value={ALL_MEDIA_TYPES}>All types</option>
            {mediaTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-faint">
            Sort
          </span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SortKey)}
            className={CONTROL_CLASS}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-3 lg:ml-auto lg:pl-1">
        <p aria-live="polite" className="text-sm text-muted tabular-nums">
          {shown === total
            ? `${total.toLocaleString()} post${total === 1 ? "" : "s"}`
            : `${shown.toLocaleString()} of ${total.toLocaleString()} posts`}
        </p>
        {filtered && (
          <button
            type="button"
            onClick={onReset}
            className="rounded-btn px-2 py-1 text-sm font-medium text-accent-text underline-offset-4 hover:underline"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
