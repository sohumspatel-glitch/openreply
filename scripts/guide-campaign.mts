/**
 * Create a "guide drop" campaign from a JSON spec, wired for the next reel.
 *
 *   npx tsx scripts/guide-campaign.mts spec.json
 *
 * The spec supplies only what changes per video (keyword, guide link, topic).
 * Everything else — the follow gate, the public replies, the follow-up card —
 * is identical on every drop of a brand and lives in that brand's profile in
 * lib/guide-campaign-brands.ts, so a campaign can never be published
 * half-configured.
 *
 * Spec:
 *   {
 *     "brand": "settr",            // optional; omitted = "startscalr"
 *     "name": "...",
 *     "keywords": ["KEYWORD", "keyword"],
 *     "guideUrl": "https://...",
 *     "guideTopic": "...",
 *     "account": "trysettr",       // optional; must be in the brand's workspace
 *     "followUp": false            // optional; drops the follow-up card
 *   }
 *
 * The account is chosen by brand: only accounts connected to that brand's
 * workspace (lib/branding.ts, by workspace name) are candidates. Settr
 * defaults to @trysettr; Startscalr to its workspace's oldest account.
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

const { GUIDE_CAMPAIGN_PROFILES, buildGuideAutomationData, resolveGuideBrand, validateGuideSpec } =
  await import("../lib/guide-campaign-brands");
const { selectBrandAccount } = await import("../lib/brand-accounts");
type Spec = import("../lib/guide-campaign-brands").GuideCampaignSpec;

const specPath = process.argv[2];
if (!specPath) {
  console.error("usage: npx tsx scripts/guide-campaign.mts <spec.json>");
  process.exit(2);
}
const spec: Spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

const brand = resolveGuideBrand(spec.brand);
const profile = GUIDE_CAMPAIGN_PROFILES[brand];
const keywords = validateGuideSpec(spec);

// Only accounts in this brand's workspace are candidates, so a Settr spec can
// never land on @startscalr (or the reverse). With no brand and no account in
// the spec this is the oldest Startscalr account, exactly what the script
// picked before brands existed.
const accounts = await prisma.instagramAccount.findMany({
  include: { workspace: { select: { name: true } } },
  orderBy: { connectedAt: "asc" },
});
if (accounts.length === 0) throw new Error("no Instagram account connected");
const account = selectBrandAccount(
  accounts,
  brand,
  spec.account ?? profile.defaultAccountUsername
);

const automation = await prisma.automation.create({
  data: buildGuideAutomationData({
    spec,
    keywords,
    profile,
    workspaceId: account.workspaceId,
    instagramAccountId: account.id,
    trackedLinkSlug: generateTrackedLinkSlug,
    reportShareSlug: generateReportShareSlug,
  }),
  include: { trackedLinks: true },
});

console.log(
  JSON.stringify(
    {
      ok: true,
      // Startscalr output stays exactly what it always was.
      ...(brand === "startscalr" ? {} : { brand, account: `@${account.username}` }),
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
