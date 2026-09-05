import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getUserMedia, type InstagramMedia } from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";

/**
 * Binds "next reel" campaigns to a real post.
 *
 * Instagram sends no webhook when a new media is published, so we poll: for
 * every campaign awaiting the creator's next reel, find the earliest reel that
 * was posted after the campaign was created and attach the campaign to it.
 * Runs on a schedule (see vercel.json) — the campaign goes live within one
 * cron interval of the reel being posted.
 */

function isReel(media: InstagramMedia): boolean {
  return media.media_product_type === "REELS";
}

function isCarousel(media: InstagramMedia): boolean {
  return (media as { media_type?: string }).media_type === "CAROUSEL_ALBUM";
}

/**
 * The keyword a carousel's caption asks for.
 *
 * Carousels cannot be bound by "the earliest one posted after the campaign was
 * created" the way reels are. A scheduled run of ten posts means several are
 * unbound at once, and time-ordering would eventually attach a campaign to the
 * wrong post — which sends the wrong guide to everybody who comments.
 *
 * The caption is unambiguous instead: the publisher refuses any caption that
 * does not open `Comment "KEYWORD"`, and each campaign owns its keyword.
 */
function captionKeyword(media: InstagramMedia): string | null {
  const m = ((media as { caption?: string }).caption ?? "").match(
    /^Comment\s+"([^"]+)"/i
  );
  return m ? m[1].toLowerCase() : null;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const pending = await prisma.automation.findMany({
    where: { pendingNextReel: true },
    include: { instagramAccount: true },
  });

  // Group by connected account so we fetch each account's media only once.
  const byAccount = new Map<
    string,
    { account: (typeof pending)[number]["instagramAccount"]; automations: typeof pending }
  >();
  for (const automation of pending) {
    const key = automation.instagramAccountId;
    const entry = byAccount.get(key);
    if (entry) entry.automations.push(automation);
    else byAccount.set(key, { account: automation.instagramAccount, automations: [automation] });
  }

  let bound = 0;
  let checked = 0;
  const failures: string[] = [];

  for (const { account, automations } of byAccount.values()) {
    checked += automations.length;
    if (!account?.accessToken) continue;

    let reels: InstagramMedia[];
    let carousels: InstagramMedia[];
    try {
      const token = decryptToken(account.accessToken);
      const media = await getUserMedia(token, 25);
      reels = media
        .filter(isReel)
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
      carousels = media.filter(isCarousel);
    } catch (err) {
      failures.push(account.id);
      console.error("[attach-next-reel] media fetch failed", account.id, err);
      continue;
    }

    for (const automation of automations) {
      // A carousel is matched on its caption keyword, a reel on its timestamp.
      // Carousel first: a campaign whose keyword is live on a published
      // carousel should never be attached to an unrelated reel.
      const match = carousels.find((c) => {
        const keyword = captionKeyword(c);
        return (
          keyword !== null &&
          new Date(c.timestamp) > automation.createdAt &&
          automation.keywords.some((k) => k.toLowerCase() === keyword)
        );
      });

      // The "next" reel = the earliest one posted after the campaign was created.
      const target =
        match ??
        reels.find((reel) => new Date(reel.timestamp) > automation.createdAt);
      if (!target) continue;

      await prisma.automation.update({
        where: { id: automation.id },
        data: {
          postId: target.id,
          postUrl: target.permalink ?? null,
          pendingNextReel: false,
          // A campaign bound to a live post should be answering comments. Reels
          // were activated by hand before; a ten-day scheduled run cannot be.
          isActive: true,
        },
      });
      bound += 1;
    }
  }

  return NextResponse.json({
    success: true,
    data: { checked, bound, failedAccounts: failures.length },
  });
}
