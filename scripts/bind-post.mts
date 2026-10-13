/**
 * Bind ONE known campaign to ONE live Instagram post, matched by its caption.
 *
 *   npx tsx scripts/bind-post.mts --campaign <automationId> --caption "<the caption's first line>" [--apply]
 *   (or --caption-b64 <base64 of the same text>)
 *
 * The Settr posting agent creates a campaign per post and knows exactly which
 * campaign belongs to which draft, so it never has to guess by keyword. That
 * matters when two posts share a keyword (two SETTER carousels in one week):
 * keyword matching alone could bind a campaign to the wrong post.
 *
 * Works for every Instagram media type (carousel, Reel/video, single image).
 * Looks at the campaign's own account only. Prints one JSON line:
 *   {"status":"bound"|"already-bound"|"not-found"|"error", ...}
 * Safe to run repeatedly.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  process.env[line.slice(0, i).trim()] ??= line
    .slice(i + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
}

const flag = (name: string) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1] ?? null;
};
const apply = process.argv.includes("--apply");
const campaignId = flag("--campaign");
// --caption-b64 carries the same text base64-encoded, so quotes and apostrophes in a caption
// ("Comment "AUDIT" and I'll...") survive being passed through a Windows shell.
const b64 = flag("--caption-b64");
const captionStart = b64 ? Buffer.from(b64, "base64").toString("utf8") : flag("--caption");

const out = (o: Record<string, unknown>) => {
  console.log(JSON.stringify(o));
};

if (!campaignId || !captionStart) {
  out({ status: "error", error: "usage: --campaign <id> --caption <first line> [--apply]" });
  process.exit(1);
}

const { prisma } = await import("../lib/db/client");
const { decryptToken } = await import("../lib/meta/oauth");
const { getUserMedia } = await import("../lib/meta/client");

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

try {
  const campaign = await prisma.automation.findUnique({
    where: { id: campaignId },
    include: { instagramAccount: true },
  });
  if (!campaign) {
    out({ status: "error", error: `campaign ${campaignId} not found` });
  } else if (campaign.postId) {
    out({
      status: "already-bound",
      campaign: campaign.name,
      keywords: campaign.keywords,
      active: campaign.isActive,
      postUrl: campaign.postUrl,
    });
  } else if (!campaign.instagramAccount.accessToken) {
    out({ status: "error", error: `@${campaign.instagramAccount.username} has no access token` });
  } else {
    const want = norm(captionStart);
    const media = await getUserMedia(decryptToken(campaign.instagramAccount.accessToken), 25);
    const hit = media.find((m) => {
      const caption = norm((m as { caption?: string }).caption ?? "");
      return caption.length > 0 && caption.startsWith(want);
    }) as { id: string; permalink?: string; media_type?: string } | undefined;

    if (!hit) {
      out({ status: "not-found", campaign: campaign.name, account: campaign.instagramAccount.username });
    } else {
      if (apply) {
        await prisma.automation.update({
          where: { id: campaign.id },
          data: { postId: hit.id, postUrl: hit.permalink ?? null, pendingNextReel: false, isActive: true },
        });
      }
      out({
        status: apply ? "bound" : "would-bind",
        campaign: campaign.name,
        keywords: campaign.keywords,
        mediaId: hit.id,
        mediaType: hit.media_type ?? null,
        postUrl: hit.permalink ?? null,
      });
    }
  }
} catch (e) {
  out({ status: "error", error: (e as Error).message });
}
await prisma.$disconnect();
process.exit(0);
