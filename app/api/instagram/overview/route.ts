import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import {
  getAccountMetricTotals,
  getAllUserMedia,
  getDailyAccountSeries,
  getMediaInsights,
  PermissionError,
  type DailyPoint,
  type InstagramMedia,
} from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";
import {
  ensureFollowerHistory,
  getFollowerHistory,
  type FollowerHistoryPoint,
} from "@/lib/reports/follower-history";

// Allow time for paginated media + per-post insight calls on larger accounts.
export const maxDuration = 60;

// Safety ceiling for "all time": bounds pagination and the number of
// per-media insight requests so we can't hammer the API or time out.
const MAX_POSTS = 500;

// How many insight requests to run at once.
const INSIGHTS_CONCURRENCY = 8;

// Instagram serves 90 days of daily account insights. Requesting more is not
// an error, it just returns nothing beyond the ceiling.
const MAX_SERIES_DAYS = 90;

/** Map over items with a bounded number of in-flight async operations. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

export interface OverviewPost {
  id: string;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  /** Collapsed label used for badges: the product type when Instagram sends
   *  one, otherwise the media type. */
  mediaType: string;
  /** Instagram's raw media_type: IMAGE | VIDEO | CAROUSEL_ALBUM. */
  rawMediaType: string;
  /** Instagram's media_product_type: REELS | FEED | AD. Null when absent. */
  mediaProductType: string | null;
  timestamp: string;
  views: number | null;
  reach: number | null;
  likes: number;
  comments: number;
  saved: number | null;
  shares: number | null;
}

/** Engagement counters Instagram only exposes as a window total. */
export interface WindowTotals {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  totalInteractions: number | null;
  profileViews: number | null;
  accountsEngaged: number | null;
}

export interface OverviewResponse {
  account: { id: string; username: string };
  accounts: Array<{ id: string; username: string }>;
  requestedCount: "all" | number;
  /** Days in the selected window, or "all" for the whole back catalogue. */
  range: "all" | number;
  /**
   * Days of daily-series data actually requested from Instagram. Capped at 90,
   * which is the real ceiling — so an "all time" view still charts 90 days.
   */
  seriesDays: number;
  truncated: boolean;
  insightsAvailable: boolean;
  /** Current follower total, or null if Instagram did not return it. */
  followers: number | null;
  /**
   * Follower total per day, ascending. Independent of the selected post range —
   * limited to what has been snapshotted plus any 30-day insights backfill.
   */
  followerHistory: FollowerHistoryPoint[];
  /**
   * Daily reach. A true per-day series, like followers — unlike the engagement
   * counters below, which Instagram only returns as a window total.
   */
  reachHistory: DailyPoint[];
  /**
   * Account-wide engagement over the selected window. These have no daily
   * breakdown available from Instagram at all, so they are figures, not lines.
   * Null means the metric was not returned for this account.
   */
  windowTotals: WindowTotals;
  totals: {
    posts: number;
    views: number;
    reach: number;
    likes: number;
    comments: number;
    saved: number;
    shares: number;
    interactions: number;
  };
  posts: OverviewPost[];
}

function isVideoLike(media: InstagramMedia): boolean {
  return (
    media.media_product_type === "REELS" || media.media_type === "VIDEO"
  );
}

export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const account = await getWorkspaceInstagramAccount(
    workspaceId,
    request.nextUrl.searchParams.get("instagramAccountId")
  );

  if (!account) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Instagram account not connected. Please connect your account first.",
      },
      { status: 400 }
    );
  }

  try {
    const accessToken = decryptToken(account.accessToken);

    // `count` is either "all" or a positive integer (last N posts).
    const countParam = request.nextUrl.searchParams.get("count");
    const isAll = countParam === "all";
    const parsedCount = countParam ? Number.parseInt(countParam, 10) : NaN;
    const requestedCount: "all" | number = isAll
      ? "all"
      : Number.isFinite(parsedCount)
        ? Math.max(parsedCount, 1)
        : 50;

    // `range` is the day window driving the whole page: the chart, the window
    // totals and which posts are shown. "all" keeps the whole back catalogue
    // and still charts the 90 days Instagram will serve.
    const rangeParam = request.nextUrl.searchParams.get("range");
    const parsedRange = rangeParam ? Number.parseInt(rangeParam, 10) : NaN;
    const range: "all" | number =
      rangeParam === "all"
        ? "all"
        : Number.isFinite(parsedRange) && parsedRange > 0
          ? parsedRange
          : "all";
    const seriesDays = Math.min(range === "all" ? MAX_SERIES_DAYS : range, MAX_SERIES_DAYS);

    const target = isAll
      ? MAX_POSTS
      : Math.min(requestedCount as number, MAX_POSTS);

    const allMedia = await getAllUserMedia(accessToken, target);
    const truncated = allMedia.length >= MAX_POSTS;

    // Windowing here rather than after the insight fan-out is what makes a
    // short range cheap: insights cost one API call per post, so a 7-day view
    // asks for a handful instead of every post on the account.
    const cutoff =
      range === "all" ? null : Date.now() - range * 86_400_000;
    const media = cutoff
      ? allMedia.filter((m) => new Date(m.timestamp).getTime() >= cutoff)
      : allMedia;

    // Likes and comments come free with basic media fields. Views / reach /
    // saved / shares require the insights permission, so fetch them per media
    // (bounded concurrency) and degrade gracefully if the token was granted
    // before that scope.
    let insightsAvailable = false;
    let permissionDenied = false;

    const insights = await mapWithConcurrency(
      media,
      INSIGHTS_CONCURRENCY,
      async (m) => {
        const metrics = isVideoLike(m)
          ? ["views", "reach", "saved", "shares", "total_interactions"]
          : ["reach", "saved", "shares", "total_interactions"];
        try {
          const data = await getMediaInsights(accessToken, m.id, metrics);
          insightsAvailable = true;
          return data;
        } catch (err) {
          if (err instanceof PermissionError) permissionDenied = true;
          return null;
        }
      }
    );

    const posts: OverviewPost[] = media.map((m, i) => {
      const ins = insights[i];
      const likes = m.like_count ?? 0;
      const comments = m.comments_count ?? 0;
      return {
        id: m.id,
        caption: m.caption?.trim() ?? null,
        permalink: m.permalink ?? null,
        thumbnailUrl: m.thumbnail_url ?? m.media_url ?? null,
        mediaType: m.media_product_type ?? m.media_type,
        rawMediaType: m.media_type,
        mediaProductType: m.media_product_type ?? null,
        timestamp: m.timestamp,
        views: ins?.views ?? null,
        reach: ins?.reach ?? null,
        likes,
        comments,
        saved: ins?.saved ?? null,
        shares: ins?.shares ?? null,
      };
    });

    const totals = posts.reduce(
      (acc, p) => {
        acc.posts += 1;
        acc.views += p.views ?? 0;
        acc.reach += p.reach ?? 0;
        acc.likes += p.likes;
        acc.comments += p.comments;
        acc.saved += p.saved ?? 0;
        acc.shares += p.shares ?? 0;
        acc.interactions += p.likes + p.comments + (p.saved ?? 0) + (p.shares ?? 0);
        return acc;
      },
      {
        posts: 0,
        views: 0,
        reach: 0,
        likes: 0,
        comments: 0,
        saved: 0,
        shares: 0,
        interactions: 0,
      }
    );

    const accounts = await prisma.instagramAccount.findMany({
      where: { workspaceId },
      orderBy: { connectedAt: "desc" },
      select: { id: true, username: true },
    });

    // Followers is a point-in-time figure and deliberately not part of
    // `totals`, which sums over the selected posts. A failure here must not
    // take down the rest of the overview.
    let followers: number | null = null;
    let followerHistory: FollowerHistoryPoint[] = [];
    try {
      followers = await ensureFollowerHistory(
        { id: account.id, instagramId: account.instagramId },
        accessToken
      );
      followerHistory = await getFollowerHistory(account.id, seriesDays);
    } catch (err) {
      console.warn(
        "[Instagram Overview] Follower history unavailable:",
        err instanceof Error ? err.message : err
      );
    }

    // Both of these are best-effort: an account without the insights scope, or
    // one Instagram simply does not report on, must still get a working page.
    let reachHistory: DailyPoint[] = [];
    let rawTotals: Record<string, number> = {};
    try {
      const [series, totalsByName] = await Promise.all([
        getDailyAccountSeries(
          accessToken,
          account.instagramId,
          ["reach"],
          seriesDays
        ),
        getAccountMetricTotals(
          accessToken,
          account.instagramId,
          [
            "views",
            "likes",
            "comments",
            "shares",
            "saves",
            "total_interactions",
            "profile_views",
            "accounts_engaged",
          ],
          seriesDays
        ),
      ]);
      reachHistory = series.reach ?? [];
      rawTotals = totalsByName;
    } catch (err) {
      console.warn(
        "[Instagram Overview] Account insights unavailable:",
        err instanceof Error ? err.message : err
      );
    }

    const pick = (name: string) =>
      typeof rawTotals[name] === "number" ? rawTotals[name] : null;
    const windowTotals: WindowTotals = {
      views: pick("views"),
      likes: pick("likes"),
      comments: pick("comments"),
      shares: pick("shares"),
      saves: pick("saves"),
      totalInteractions: pick("total_interactions"),
      profileViews: pick("profile_views"),
      accountsEngaged: pick("accounts_engaged"),
    };

    const data: OverviewResponse = {
      account: { id: account.id, username: account.username },
      accounts,
      requestedCount,
      range,
      seriesDays,
      truncated,
      insightsAvailable: insightsAvailable && !permissionDenied,
      followers,
      followerHistory,
      reachHistory,
      windowTotals,
      totals,
      posts,
    };

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[Instagram Overview] Error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load Instagram overview" },
      { status: 500 }
    );
  }
}
