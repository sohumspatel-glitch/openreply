/**
 * Bind a pending campaign to the carousel that was just posted.
 *
 *   npx tsx scripts/bind-carousel.mts <automationId> [--account trysettr] [--brand settr]
 *
 * The account is always the campaign's own (never "the first account"), so a
 * Settr campaign binds against @trysettr's media and a Startscalr one against
 * @startscalr's. --account / --brand are optional guards: when given, the
 * script refuses if the campaign is not on that handle or brand workspace.
 *
 * bind-next-reel.mts only looks at REELS, and a carousel comes back as
 * CAROUSEL_ALBUM, so it never sees one. This does the same job for an album:
 * take the newest media on the account, confirm it is a carousel posted in the
 * last hour, and attach it. Anything older or of the wrong type is refused —
 * binding a campaign to the wrong post is worse than not binding it at all.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const automationId = process.argv[2];
if (!automationId || automationId.startsWith("--")) {
  console.error("usage: npx tsx scripts/bind-carousel.mts <automationId> [--account <handle>] [--brand <brand>]");
  process.exit(2);
}
const flag = (name: string) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1] ?? null;
};

const { prisma } = await import("../lib/db/client");
const { decryptToken } = await import("../lib/meta/oauth");
const { getUserMedia } = await import("../lib/meta/client");
const { assertCampaignAccount } = await import("../lib/brand-accounts");
const { resolveGuideBrand } = await import("../lib/guide-campaign-brands");

const expectedBrand = flag("--brand") ? resolveGuideBrand(flag("--brand")) : null;

const automation = await prisma.automation.findUnique({
  where: { id: automationId },
  include: { instagramAccount: { include: { workspace: { select: { name: true } } } } },
});
if (!automation) throw new Error(`no automation ${automationId}`);
if (automation.instagramAccount) {
  assertCampaignAccount(automation.instagramAccount, {
    username: flag("--account"),
    brand: expectedBrand,
  });
  console.error(`[bind] campaign is on @${automation.instagramAccount.username}`);
}
const token = automation.instagramAccount?.accessToken;
if (!token) throw new Error("automation has no connected Instagram account");

const media = await getUserMedia(decryptToken(token), 5);
const newest = media[0];
if (!newest) throw new Error("account has no media");

console.log("newest media:", JSON.stringify({
  id: newest.id,
  type: (newest as { media_type?: string }).media_type,
  timestamp: (newest as { timestamp?: string }).timestamp,
  permalink: (newest as { permalink?: string }).permalink,
}, null, 2));

const type = (newest as { media_type?: string }).media_type;
if (type !== "CAROUSEL_ALBUM") {
  throw new Error(`newest media is ${type}, not CAROUSEL_ALBUM — refusing to bind`);
}
const ts = new Date((newest as { timestamp: string }).timestamp);
const ageMin = (Date.now() - ts.getTime()) / 60000;
if (ageMin > 60) {
  throw new Error(`newest carousel is ${Math.round(ageMin)} min old — refusing to bind`);
}

const updated = await prisma.automation.update({
  where: { id: automationId },
  data: {
    postId: newest.id,
    postUrl: (newest as { permalink?: string }).permalink ?? null,
    pendingNextReel: false,
    isActive: true,
  },
  select: { id: true, name: true, postId: true, postUrl: true, pendingNextReel: true, isActive: true, keywords: true },
});

console.log(JSON.stringify({ ok: true, ...updated }, null, 2));
await prisma.$disconnect();
