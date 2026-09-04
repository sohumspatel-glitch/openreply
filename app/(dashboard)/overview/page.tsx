"use client";

/**
 * Instagram Overview Page
 *
 * The visual home of the app: every post the API returned, as a grid of cards
 * that carry their own analytics, above range-wide totals and the follower
 * trend. Views / reach / saved / shares come from Instagram media insights
 * (requires the insights permission); likes and comments are always available.
 *
 * Sorting, filtering and search all run over the posts already in memory, so
 * only the account and the range ever re-hit the API.
 */

import { useEffect, useState } from "react";
import PerformanceChart from "@/components/overview/performance-chart";
import { formatCompact } from "@/components/overview/format";
import OverviewHeader, { rangeLabel } from "@/components/overview/overview-header";
import OverviewToolbar from "@/components/overview/overview-toolbar";
import PostDetailPanel from "@/components/overview/post-detail-panel";
import PostGrid, { PostGridSkeleton } from "@/components/overview/post-grid";
import StatTile, { StatTileSkeleton } from "@/components/overview/stat-tile";
import {
  ALL_MEDIA_TYPES,
  availabilityOf,
  filterPosts,
  mediaTypeFilters,
  sortPosts,
  type SortKey,
} from "@/components/overview/post-analytics";
import type {
  OverviewPost,
  OverviewResponse,
} from "@/app/api/instagram/overview/route";

const TILE_GRID = "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4";

interface Tile {
  key: string;
  label: string;
  value: number;
  /** Copper anchors the row on exactly one figure. */
  accent?: boolean;
  hint?: string;
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [range, setRange] = useState("30");
  const [reloadNonce, setReloadNonce] = useState(0);

  const [sort, setSort] = useState<SortKey>("newest");
  const [mediaType, setMediaType] = useState(ALL_MEDIA_TYPES);
  const [query, setQuery] = useState("");
  const [selectedPost, setSelectedPost] = useState<OverviewPost | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const params = new URLSearchParams();
    if (selectedAccountId !== "all") {
      params.set("instagramAccountId", selectedAccountId);
    }
    params.set("range", range);
    // The grid is windowed by date now, so ask for the ceiling and let the
    // server trim; a short range still costs few insight calls because it
    // filters the media before fanning out.
    params.set("count", "all");

    fetch(`/api/instagram/overview?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setData(res.data);
          setError(null);
          setSelectedPost(null);
        } else {
          setError(res.error ?? "Failed to load overview");
        }
      })
      .catch((err: unknown) => {
        // An aborted request was superseded, not failed — its replacement owns
        // the loading state from here.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to load overview");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    // An all-time load can take most of a minute, so without this a slow first
    // response would land on top of a fast second one.
    return () => controller.abort();
  }, [selectedAccountId, range, reloadNonce]);

  const posts = data?.posts ?? [];
  const availability = availabilityOf(posts);
  const mediaTypes = mediaTypeFilters(posts);
  // A type that was in the previous range may not be in this one; falling back
  // to "all" beats silently filtering every post away.
  const activeMediaType = mediaTypes.includes(mediaType)
    ? mediaType
    : ALL_MEDIA_TYPES;
  const visiblePosts = sortPosts(
    filterPosts(posts, { mediaType: activeMediaType, query }),
    sort
  );

  const totals = data?.totals;
  const tiles: Tile[] = totals
    ? [
        { key: "posts", label: "Posts", value: totals.posts, accent: true },
        ...(availability.views
          ? [
              {
                key: "views",
                label: "Views",
                value: totals.views,
                hint: "Reels and videos only",
              },
            ]
          : []),
        ...(availability.insights
          ? [{ key: "reach", label: "Reach", value: totals.reach }]
          : []),
        { key: "likes", label: "Likes", value: totals.likes },
        { key: "comments", label: "Comments", value: totals.comments },
        ...(availability.insights
          ? [
              { key: "saved", label: "Saved", value: totals.saved },
              { key: "shares", label: "Shares", value: totals.shares },
              {
                key: "interactions",
                label: "Interactions",
                value: totals.interactions,
                hint: "Likes, comments, saves, shares",
              },
            ]
          : []),
      ]
    : [];

  // The response flag alone is not enough to hide anything: it flips false when
  // a single legacy post rejects one metric. Only say insights are missing when
  // no post actually carries any.
  const insightsMissing =
    data !== null &&
    !data.insightsAvailable &&
    !availability.insights &&
    posts.length > 0;

  // Loading is raised by whatever triggered the reload rather than by the
  // effect, which would otherwise set state during its own synchronous body.
  // Instagram reports these only as a total for the window — there is no daily
  // breakdown to chart, so they live as figures. A metric it does not return
  // for this account is dropped rather than shown as a zero.
  const accountTiles = (() => {
    const w = data?.windowTotals;
    if (!w) return [];
    const defs: Array<{ key: string; label: string; value: number | null; hint: string }> = [
      { key: "aViews", label: "Views", value: w.views, hint: "Account-wide" },
      { key: "aLikes", label: "Likes", value: w.likes, hint: "Account-wide" },
      { key: "aComments", label: "Comments", value: w.comments, hint: "Account-wide" },
      { key: "aShares", label: "Shares", value: w.shares, hint: "Account-wide" },
      { key: "aSaves", label: "Saves", value: w.saves, hint: "Account-wide" },
      { key: "aInteractions", label: "Interactions", value: w.totalInteractions, hint: "Account-wide" },
      { key: "aProfile", label: "Profile visits", value: w.profileViews, hint: "Account-wide" },
      { key: "aEngaged", label: "Accounts engaged", value: w.accountsEngaged, hint: "Account-wide" },
    ];
    return defs.filter(
      (d): d is { key: string; label: string; value: number; hint: string } =>
        typeof d.value === "number"
    );
  })();

  function handleAccountChange(accountId: string) {
    setLoading(true);
    setSelectedAccountId(accountId);
  }

  function handleRangeChange(next: string) {
    setLoading(true);
    setRange(next);
  }

  function handleRetry() {
    setLoading(true);
    setError(null);
    setReloadNonce((nonce) => nonce + 1);
  }

  function resetFilters() {
    setMediaType(ALL_MEDIA_TYPES);
    setQuery("");
  }

  return (
    <div className="space-y-8">
      <OverviewHeader
        data={data}
        loading={loading}
        selectedAccountId={selectedAccountId}
        onAccountChange={handleAccountChange}
        range={range}
        onRangeChange={handleRangeChange}
      />

      {error ? (
        <div className="rounded-panel border border-border bg-error-tint p-8 text-center">
          <p className="text-sm font-medium text-error">{error}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-btn bg-ink px-4 py-2 text-sm font-medium text-on-ink motion-safe:transition-colors hover:bg-ink-hover"
            >
              Try again
            </button>
            {error.includes("connect") && (
              <a
                href="/api/instagram/connect"
                className="text-sm font-medium text-accent-text underline-offset-4 hover:underline"
              >
                Connect Instagram
              </a>
            )}
          </div>
        </div>
      ) : loading ? (
        <>
          <div className={TILE_GRID}>
            {Array.from({ length: 8 }, (_, index) => (
              <StatTileSkeleton key={index} />
            ))}
          </div>
          <PostGridSkeleton />
        </>
      ) : data ? (
        <>
          {insightsMissing && (
            <div className="rounded-panel border border-border bg-surface-warm p-4">
              <p className="text-sm text-foreground">
                Views, reach, saved and shares need the insights permission, so
                they are hidden below.
              </p>
              <p className="mt-1 text-sm text-muted">
                Reconnect your account to grant it — likes and comments are
                shown in the meantime.
              </p>
              <a
                href="/api/instagram/connect"
                className="mt-3 inline-block text-sm font-medium text-accent-text underline-offset-4 hover:underline"
              >
                Reconnect Instagram
              </a>
            </div>
          )}

          {/* Two different questions, so two rows rather than one blended set.
              This row sums the POSTS in range: their lifetime performance. The
              account row below counts activity that happened IN the window,
              across everything including older posts, which is why the two
              never agree and are never added together. */}
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            Posts published in {rangeLabel(range)}
          </p>
          <div className={TILE_GRID}>
            {tiles.map((tile) => (
              <StatTile
                key={tile.key}
                label={tile.label}
                value={formatCompact(tile.value)}
                accent={tile.accent}
                hint={tile.hint}
              />
            ))}
          </div>

          {accountTiles.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-faint">
                Account activity in {rangeLabel(range)}
              </p>
              <div className={TILE_GRID}>
                {accountTiles.map((tile) => (
                  <StatTile
                    key={tile.key}
                    label={tile.label}
                    value={formatCompact(tile.value)}
                    hint={tile.hint}
                  />
                ))}
              </div>
            </>
          )}

          <PerformanceChart
            followerHistory={data.followerHistory}
            reachHistory={data.reachHistory}
            posts={data.posts}
            followers={data.followers}
            rangeLabel={rangeLabel(range)}
          />

          <section className="space-y-4">
            <h2 className="font-title text-lg font-semibold tracking-tight text-foreground">
              Posts
            </h2>

            {posts.length === 0 ? (
              <div className="rounded-panel border border-border bg-surface p-10 text-center shadow-hair">
                <p className="text-sm font-medium text-foreground">
                  No posts yet
                </p>
                <p className="mt-1 text-sm text-muted">
                  Anything @{data.account.username} publishes will show up here.
                </p>
              </div>
            ) : (
              <>
                <OverviewToolbar
                  sort={sort}
                  onSortChange={setSort}
                  mediaType={activeMediaType}
                  mediaTypes={mediaTypes}
                  onMediaTypeChange={setMediaType}
                  query={query}
                  onQueryChange={setQuery}
                  shown={visiblePosts.length}
                  total={posts.length}
                  onReset={resetFilters}
                />

                {visiblePosts.length === 0 ? (
                  <div className="rounded-panel border border-border bg-surface p-10 text-center shadow-hair">
                    <p className="text-sm font-medium text-foreground">
                      No posts match these filters
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {posts.length.toLocaleString()} post
                      {posts.length === 1 ? " is" : "s are"} loaded for this
                      range.
                    </p>
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="mt-4 rounded-btn border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground motion-safe:transition-colors hover:border-border-firm"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <PostGrid posts={visiblePosts} onSelect={setSelectedPost} />
                )}
              </>
            )}
          </section>
        </>
      ) : null}

      {selectedPost && (
        <PostDetailPanel
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </div>
  );
}
