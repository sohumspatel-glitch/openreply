/**
 * Post analytics rules
 *
 * The overview payload spells "not applicable" and "we could not read it" the
 * same way, as `null`, so the tiles, the card overlay and the detail panel all
 * need the same answers about what a figure means and whether it may be shown.
 * Those answers live here so the three surfaces can never drift apart.
 */

import type { OverviewPost } from "@/app/api/instagram/overview/route";

/**
 * `mediaType` is `media_product_type ?? media_type`, so it mixes two
 * vocabularies: normally FEED / REELS / AD / STORY, and only IMAGE / VIDEO /
 * CAROUSEL_ALBUM when Instagram omitted the product type. FEED cannot be
 * resolved into image-vs-carousel from this payload, so it stays "Post"
 * instead of guessing.
 */
const MEDIA_TYPE_LABELS: Record<string, string> = {
  REELS: "Reel",
  VIDEO: "Video",
  IMAGE: "Image",
  CAROUSEL_ALBUM: "Carousel",
  FEED: "Post",
  AD: "Ad",
  STORY: "Story",
};

export function mediaTypeLabel(mediaType: string): string {
  return (
    MEDIA_TYPE_LABELS[mediaType] ??
    mediaType.charAt(0) + mediaType.slice(1).toLowerCase()
  );
}

/**
 * Mirrors the route's own test. Views are only requested for video-like media,
 * so this is also what decides whether a missing `views` is a gap or simply
 * inapplicable.
 */
export function isVideoLike(post: OverviewPost): boolean {
  return post.mediaType === "REELS" || post.mediaType === "VIDEO";
}

/**
 * Saves and shares travel in the same insights request as reach and therefore
 * fail as a set. When reach is null the post has no insights at all, and a
 * likes-plus-comments sum would present itself as a complete interaction total
 * while silently missing two of its four parts — so it is null instead.
 */
export function interactionsOf(post: OverviewPost): number | null {
  if (post.reach === null) return null;
  return post.likes + post.comments + (post.saved ?? 0) + (post.shares ?? 0);
}

/** Interactions per person reached. */
export function engagementRateOf(post: OverviewPost): number | null {
  const interactions = interactionsOf(post);
  if (interactions === null || !post.reach) return null;
  return interactions / post.reach;
}

/** Saves per person reached — the closest thing to an "was it worth keeping" rate. */
export function saveRateOf(post: OverviewPost): number | null {
  if (post.saved === null || !post.reach) return null;
  return post.saved / post.reach;
}

export interface MetricRow {
  key: string;
  label: string;
  value: number | null;
}

/** Every stored analytic for one post, in a fixed order. Callers drop the nulls. */
export function metricRows(post: OverviewPost): MetricRow[] {
  return [
    { key: "views", label: "Views", value: post.views },
    { key: "reach", label: "Reach", value: post.reach },
    { key: "likes", label: "Likes", value: post.likes },
    { key: "comments", label: "Comments", value: post.comments },
    { key: "saved", label: "Saved", value: post.saved },
    { key: "shares", label: "Shares", value: post.shares },
    { key: "interactions", label: "Interactions", value: interactionsOf(post) },
  ];
}

/**
 * The two figures worth showing without a hover. Reels lead with views; nothing
 * else has views by construction, so reach is their honest headline. Likes and
 * comments backfill whenever insights are missing, and they never are.
 */
export function headlineMetrics(post: OverviewPost): MetricRow[] {
  const rows = metricRows(post);
  const preference = isVideoLike(post)
    ? ["views", "likes", "reach", "comments"]
    : ["reach", "likes", "comments"];
  return preference
    .flatMap((key) => rows.filter((row) => row.key === key))
    .filter((row) => row.value !== null)
    .slice(0, 2);
}

export interface MetricAvailability {
  /** Any post carries a view count. False for an account that posts no video. */
  views: boolean;
  /** Any post carries insights at all — reach, saves, shares, interactions. */
  insights: boolean;
}

/**
 * What may be shown, decided from the data rather than from the response's
 * `insightsAvailable` flag: that flag flips false when a single legacy post
 * rejects one metric, and is false for an account with no posts at all, so on
 * its own it would hide tiles that are full of real numbers.
 */
export function availabilityOf(posts: OverviewPost[]): MetricAvailability {
  return {
    views: posts.some((post) => post.views !== null),
    insights: posts.some((post) => post.reach !== null),
  };
}

export type SortKey = "newest" | "views" | "reach" | "engagement";

export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "views", label: "Most views" },
  { value: "reach", label: "Most reach" },
  { value: "engagement", label: "Most engagement" },
];

/** Posts missing the sort metric sink to the bottom rather than ranking as zero. */
function compareDesc(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function newestFirst(a: OverviewPost, b: OverviewPost): number {
  return Date.parse(b.timestamp) - Date.parse(a.timestamp);
}

export function sortPosts(posts: OverviewPost[], key: SortKey): OverviewPost[] {
  const sorted = [...posts];
  switch (key) {
    case "views":
      return sorted.sort(
        (a, b) => compareDesc(a.views, b.views) || newestFirst(a, b)
      );
    case "reach":
      return sorted.sort(
        (a, b) => compareDesc(a.reach, b.reach) || newestFirst(a, b)
      );
    case "engagement":
      return sorted.sort(
        (a, b) =>
          compareDesc(interactionsOf(a), interactionsOf(b)) || newestFirst(a, b)
      );
    default:
      return sorted.sort(newestFirst);
  }
}

export const ALL_MEDIA_TYPES = "all";

/** Only the labels actually present, so the filter can never offer a dead option. */
export function mediaTypeFilters(posts: OverviewPost[]): string[] {
  const labels = new Set(posts.map((post) => mediaTypeLabel(post.mediaType)));
  return [...labels].sort();
}

export interface PostFilters {
  /** A label from `mediaTypeFilters`, or `ALL_MEDIA_TYPES`. */
  mediaType: string;
  query: string;
}

export function filterPosts(
  posts: OverviewPost[],
  filters: PostFilters
): OverviewPost[] {
  const query = filters.query.trim().toLowerCase();
  return posts.filter((post) => {
    if (
      filters.mediaType !== ALL_MEDIA_TYPES &&
      mediaTypeLabel(post.mediaType) !== filters.mediaType
    ) {
      return false;
    }
    if (query === "") return true;
    return (post.caption ?? "").toLowerCase().includes(query);
  });
}
