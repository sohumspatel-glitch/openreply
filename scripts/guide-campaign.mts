/**
 * Create a "guide drop" campaign from a JSON spec, wired for the next reel.
 *
 *   npx tsx scripts/guide-campaign.mts spec.json
 *
 * The spec supplies only what changes per video (keyword, guide link, topic).
 * Everything else — the follow gate, the public replies, the free-gift
 * follow-up card — is identical on every drop and lives in FREE_GIFT / DEFAULTS
 * below, so a campaign can never be published half-configured.
 *
 * The campaign is created INACTIVE and pendingNextReel, so it matches nothing
 * until scripts/bind-next-reel.mts attaches it to the reel that gets posted.
 */
import fs from "node:fs";
import path from "node:path";

// Prisma reads DATABASE_URL when its module is first imported, so the env has
// to be populated before any dynamic import below.
const root = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  process.env[line.slice(0, i).trim()] ??= line
    .slice(i + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
}

const { prisma } = await import("../lib/db/client");
const { generateTrackedLinkSlug } = await import("../lib/tracking/server");
const { generateReportShareSlug } = await import("../lib/reports/share");

/** The lead magnet at the end of every drop. Same page every time. */
const FREE_GIFT = {
  title: "Hey! I wanna give you a FREE GIFT that will jumpstart scaling with AI.",
  subtitle: "CLAIM YOUR FREE GIFT BELOW",
  buttonLabel: "FREE GIFT!",
  url: "https://shop.startscalr.com/free",
  imageUrl:
    "https://cdn.phototourl.com/free/2026-09-03-98341ab0-67c0-4911-9b52-07addc41f9b5.png",
  imageAspect: "square",
  delayMinutes: 240,
};

const DEFAULTS = {
  followPromptMessage:
    "hey {username} - the guide is yours, free. one thing first: follow me so you actually see the next one. tap below once you're following and i'll send it straight over.",
  followPromptButtonLabel: "i'm following",
  linkButtonLabel: "get the guide",
  publicReplies: [
    "just sent it to your DMs 🙌 lemme know if it came through!",
    "DM'd you just now 📩 tell me if you got it!",
    "it's sitting in your DMs 👀 shout if it didn't land!",
    "sent it over ✅ lemme know if you see it!",
    "check your inbox 💌 hit me back if it's not there!",
  ],
};

type Spec = {
  name: string;
  /** Main keyword plus every variation a commenter might actually type. */
  keywords: string[];
  /** Public Notion URL for this drop's guide. */
  guideUrl: string;
  /** One line describing the guide, dropped into the reveal DM. */
  guideTopic: string;
};

const specPath = process.argv[2];
if (!specPath) {
  console.error("usage: npx tsx scripts/guide-campaign.mts <spec.json>");
  process.exit(2);
}
const spec: Spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

for (const field of ["name", "guideUrl", "guideTopic"] as const) {
  if (!spec[field]?.trim()) throw new Error(`spec.${field} is required`);
}
const keywords = [...new Set((spec.keywords ?? []).map((k) => k.trim()).filter(Boolean))];
if (keywords.length === 0) throw new Error("spec.keywords must have at least one keyword");
if (!/^https:\/\//.test(spec.guideUrl)) throw new Error("guideUrl must be https");

const account = await prisma.instagramAccount.findFirst({
  orderBy: { connectedAt: "asc" },
});
if (!account) throw new Error("no Instagram account connected");

const automation = await prisma.automation.create({
  data: {
    workspaceId: account.workspaceId,
    instagramAccountId: account.id,
    name: spec.name,
    keywords,
    wholeWordMatch: true,
    // Waits for the reel. matchAnyPost stays false so it can never fire on the
    // back catalogue while it is waiting.
    matchAnyPost: false,
    pendingNextReel: true,
    // Published only once the reel is bound.
    isActive: false,
    dmTriggerEnabled: true,
    dmMessage: `here is the link to the guide about ${spec.guideTopic}. ENJOY! {link}`,
    linkButtonLabel: DEFAULTS.linkButtonLabel,
    requireFollow: true,
    followPromptMessage: DEFAULTS.followPromptMessage,
    followPromptButtonLabel: DEFAULTS.followPromptButtonLabel,
    publicReplyEnabled: true,
    publicReplyMessages: DEFAULTS.publicReplies,
    publicReplyMessage: DEFAULTS.publicReplies[0],
    followUpEnabled: true,
    followUpDelayMinutes: FREE_GIFT.delayMinutes,
    followUpMessage: `one more thing {username}. i've got a free gift that pairs with that guide - claim it here: ${FREE_GIFT.url}`,
    followUpCardTitle: FREE_GIFT.title,
    followUpCardSubtitle: FREE_GIFT.subtitle,
    followUpButtonLabel: FREE_GIFT.buttonLabel,
    followUpLinkUrl: FREE_GIFT.url,
    followUpImageUrl: FREE_GIFT.imageUrl,
    followUpImageAspect: FREE_GIFT.imageAspect,
    reportShareSlug: generateReportShareSlug(),
    trackedLinks: {
      create: [
        {
          workspaceId: account.workspaceId,
          slug: generateTrackedLinkSlug(),
          label: "Primary campaign link",
          destinationUrl: spec.guideUrl,
          purpose: "REVEAL",
        },
        {
          workspaceId: account.workspaceId,
          slug: generateTrackedLinkSlug(),
          label: FREE_GIFT.buttonLabel,
          destinationUrl: FREE_GIFT.url,
          purpose: "FOLLOWUP",
        },
      ],
    },
  },
  include: { trackedLinks: true },
});

console.log(
  JSON.stringify(
    {
      ok: true,
      id: automation.id,
      name: automation.name,
      keywords: automation.keywords,
      isActive: automation.isActive,
      pendingNextReel: automation.pendingNextReel,
      revealDm: automation.dmMessage,
      links: automation.trackedLinks.map((l) => ({
        purpose: l.purpose,
        slug: l.slug,
        to: l.destinationUrl,
      })),
    },
    null,
    2
  )
);

await prisma.$disconnect();
