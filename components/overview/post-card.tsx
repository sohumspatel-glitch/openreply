"use client";

/**
 * Post card
 *
 * Thumbnail-first, and the card itself is the control that opens the detail
 * panel. "Open on Instagram" is a sibling link rather than a nested one, both
 * because a button may not contain an anchor and because the card must not
 * turn a click into an external redirect.
 */

import { useState } from "react";
import {
  formatCompact,
  formatRate,
  formatShortDate,
} from "@/components/overview/format";
import {
  engagementRateOf,
  headlineMetrics,
  mediaTypeLabel,
  metricRows,
} from "@/components/overview/post-analytics";
import type { OverviewPost } from "@/app/api/instagram/overview/route";

interface PostCardProps {
  post: OverviewPost;
  onOpen: () => void;
}

export default function PostCard({ post, onOpen }: PostCardProps) {
  // These are signed CDN links with a short life, so a card that sits open long
  // enough will start serving 403s. Fall back to the placeholder rather than
  // leaving a broken image behind.
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const thumbnail = thumbnailFailed ? null : post.thumbnailUrl;

  const label = mediaTypeLabel(post.mediaType);
  const caption = post.caption || `${label} post`;
  const headline = headlineMetrics(post);
  const overlayRows = metricRows(post).filter((row) => row.value !== null);
  const engagement = engagementRateOf(post);

  return (
    <article className="group relative h-full">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full flex-col overflow-hidden rounded-media border border-border bg-surface text-left shadow-hair motion-safe:transition-shadow motion-safe:duration-200 motion-safe:ease-expressive hover:shadow-card"
      >
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-t-media bg-surface-sand">
          {thumbnail ? (
            // object-contain, not cover: the bed is there so a 9:16 reel and a
            // 1:1 post can sit in the same grid without either being cropped.
            // The alt is empty because the caption is rendered as text below.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnail}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setThumbnailFailed(true)}
              className="h-full w-full object-contain"
            />
          ) : (
            // Normal, not an error: a carousel's parent media carries no
            // thumbnail at all.
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-xs text-muted">No preview</span>
            </div>
          )}

          {/* Above the overlay so it does not jump out of place on hover. */}
          <span className="absolute left-3 top-3 z-10 rounded-pill bg-ink px-2 py-0.5 text-[11px] font-medium text-on-ink">
            {label}
          </span>

          {/* Chrome over media. A scrim rather than real glass: this renders
              once per post and a backdrop-filter would be composited every
              frame, on every card. The card surface underneath stays opaque. Hidden from assistive tech because it
              would otherwise bloat the button's name; the detail panel is the
              accessible route to the same figures. */}
          <div
            aria-hidden="true"
            className="scrim-ink pointer-events-none absolute inset-0 flex flex-col justify-center overflow-hidden p-3 pt-10 opacity-0 motion-safe:transition-opacity motion-safe:duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <dl className="space-y-1 text-[11px] leading-tight">
              {overlayRows.map((row) => (
                <div
                  key={row.key}
                  className="flex items-baseline justify-between gap-2"
                >
                  <dt className="text-on-ink-mute">{row.label}</dt>
                  <dd className="font-semibold tabular-nums text-on-ink">
                    {formatCompact(row.value)}
                  </dd>
                </div>
              ))}
              {engagement !== null && (
                <div className="flex items-baseline justify-between gap-2 border-t border-border-invert pt-1">
                  <dt className="text-on-ink-mute">Engagement</dt>
                  <dd className="font-semibold tabular-nums text-tan">
                    {formatRate(engagement)}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1 px-3 py-3">
          <p className="truncate text-sm text-foreground-soft">{caption}</p>
          <p className="text-xs text-muted">
            <span>{formatShortDate(post.timestamp)}</span>
            {headline.map((metric) => (
              <span key={metric.key}>
                {" · "}
                <span className="font-medium tabular-nums text-foreground-soft">
                  {formatCompact(metric.value)}
                </span>{" "}
                {metric.label.toLowerCase()}
              </span>
            ))}
          </p>
          <span className="sr-only">View every analytic for this post</span>
        </div>
      </button>

      {/* Named with the caption: every card would otherwise expose a link
          called just "Instagram". */}
      {post.permalink && (
        <a
          href={post.permalink}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open on Instagram: ${caption}`}
          className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-pill bg-ink px-2.5 py-1 text-[11px] font-medium text-on-ink motion-safe:transition-colors hover:bg-ink-hover"
        >
          <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3">
            <path
              d="M4.5 1.5H10.5V7.5M10.5 1.5 5 7M9 7.5v3H1.5V3h3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Instagram
        </a>
      )}
    </article>
  );
}
