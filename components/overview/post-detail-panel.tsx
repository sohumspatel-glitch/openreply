"use client";

/**
 * Post detail panel
 *
 * Everything the payload holds about one post, at full precision. Modal rather
 * than an expanding card so the grid keeps its rhythm, and so focus has one
 * unambiguous place to go and come back from.
 */

import { useEffect, useId, useRef, useState } from "react";
import {
  formatExact,
  formatFullDate,
  formatRate,
} from "@/components/overview/format";
import {
  engagementRateOf,
  isVideoLike,
  mediaTypeLabel,
  metricRows,
  saveRateOf,
} from "@/components/overview/post-analytics";
import type { OverviewPost } from "@/app/api/instagram/overview/route";

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** The route caps captions here, so a caption this long was very likely cut. */
const CAPTION_LIMIT = 120;

interface PostDetailPanelProps {
  post: OverviewPost;
  onClose: () => void;
}

export default function PostDetailPanel({
  post,
  onClose,
}: PostDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Runs once per open: taking onClose as a dependency would tear the trap down
  // and restore focus every time the parent re-rendered with a fresh callback.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE)
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  const label = mediaTypeLabel(post.mediaType);
  const thumbnail = thumbnailFailed ? null : post.thumbnailUrl;
  const rows = metricRows(post);
  const engagement = engagementRateOf(post);
  const saveRate = saveRateOf(post);
  const captionTruncated = (post.caption?.length ?? 0) >= CAPTION_LIMIT;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <div className="glass-ink absolute inset-0" onClick={onClose} />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-stage border border-border bg-surface shadow-media sm:max-w-3xl sm:rounded-b-stage"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-soft px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-text">
              {label}
            </p>
            <h2
              id={titleId}
              className="mt-1 truncate font-title text-lg font-semibold tracking-tight text-foreground"
            >
              {post.caption || `${label} post`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-initial-focus
            aria-label="Close post details"
            className="shrink-0 rounded-btn border border-border bg-surface p-2 text-muted motion-safe:transition-colors hover:border-border-firm hover:text-foreground"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
              <path
                d="M4 4 12 12M12 4 4 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
            <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-media bg-surface-sand">
              {thumbnail ? (
                // Empty alt: the caption sits beside it as text.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnail}
                  alt=""
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() => setThumbnailFailed(true)}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-xs text-muted">No preview</span>
              )}
            </div>

            <div className="min-w-0">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
                Caption
              </h3>
              {post.caption ? (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">
                  {post.caption}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted">No caption</p>
              )}
              {captionTruncated && (
                <p className="mt-2 text-xs text-muted">
                  Only the first {CAPTION_LIMIT} characters are stored for the
                  overview.
                </p>
              )}

              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <dt className="text-muted">Media type</dt>
                  <dd className="font-medium text-foreground">{label}</dd>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  {/* Instagram reports two separate things and they answer
                      different questions: the format it was uploaded as, and
                      the surface it was published to. A reel and a feed video
                      are both VIDEO. */}
                  <dt className="text-muted">Format</dt>
                  <dd className="font-mono text-xs text-foreground-soft">
                    {post.rawMediaType}
                  </dd>
                </div>
                {post.mediaProductType ? (
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <dt className="text-muted">Published as</dt>
                    <dd className="font-mono text-xs text-foreground-soft">
                      {post.mediaProductType}
                    </dd>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <dt className="text-muted">Posted</dt>
                  <dd className="font-medium text-foreground">
                    {formatFullDate(post.timestamp)}
                  </dd>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <dt className="text-muted">Media ID</dt>
                  <dd className="font-mono text-xs text-foreground-soft">
                    {post.id}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <h3 className="mt-8 text-xs font-semibold uppercase tracking-wide text-faint">
            Metrics
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {rows.map((row) => (
              <div
                key={row.key}
                className="rounded-panel border border-border bg-surface-warm px-3 py-3"
              >
                <dt className="text-xs text-muted">{row.label}</dt>
                <dd
                  className={`mt-1 font-title text-lg font-semibold tabular-nums ${
                    row.value === null ? "text-muted" : "text-foreground"
                  }`}
                >
                  {formatExact(row.value)}
                </dd>
              </div>
            ))}
            <div className="rounded-panel border border-border bg-surface-warm px-3 py-3">
              <dt className="text-xs text-muted">Engagement rate</dt>
              <dd
                className={`mt-1 font-title text-lg font-semibold tabular-nums ${
                  engagement === null ? "text-muted" : "text-foreground"
                }`}
              >
                {formatRate(engagement)}
              </dd>
            </div>
            <div className="rounded-panel border border-border bg-surface-warm px-3 py-3">
              <dt className="text-xs text-muted">Save rate</dt>
              <dd
                className={`mt-1 font-title text-lg font-semibold tabular-nums ${
                  saveRate === null ? "text-muted" : "text-foreground"
                }`}
              >
                {formatRate(saveRate)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted">
            Interactions are likes, comments, saves and shares. Both rates are
            measured against reach.
          </p>

          {post.reach === null && (
            <p className="mt-1 text-xs text-muted">
              Instagram returned no insights for this post, so reach, saves,
              shares and both rates are unavailable.
            </p>
          )}
          {post.views === null && !isVideoLike(post) && (
            <p className="mt-1 text-xs text-muted">
              Views are only reported for reels and videos.
            </p>
          )}
        </div>

        <div className="border-t border-border-soft px-5 py-4 sm:px-6">
          {post.permalink ? (
            <a
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-btn bg-ink px-4 py-2.5 text-sm font-medium text-on-ink motion-safe:transition-colors hover:bg-ink-hover"
            >
              <svg
                viewBox="0 0 12 12"
                aria-hidden="true"
                className="h-3.5 w-3.5 text-tan"
              >
                <path
                  d="M4.5 1.5H10.5V7.5M10.5 1.5 5 7M9 7.5v3H1.5V3h3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Open on Instagram
            </a>
          ) : (
            <p className="text-sm text-muted">
              Instagram returned no link for this post.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
