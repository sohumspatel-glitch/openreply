/**
 * Bind pending campaigns to carousels once they actually publish.
 *
 *   npx tsx scripts/bind-scheduled-carousels.mts [--apply]
 *
 * A scheduled post has no media id until it goes live, so a campaign cannot be
 * bound at the time it is created. This closes that gap: it reads recent media,
 * finds carousels, and matches each one to its campaign by the keyword in the
 * caption.
 *
 * Matching on the caption keyword rather than on "the newest carousel" is the
 * whole point. Ten posts go out over ten days, and any run of this script could
 * see several unbound at once — picking the newest would eventually bind the
 * wrong campaign to the wrong post, and a campaign bound to the wrong post
 * sends the wrong guide to everybody who comments. The keyword is unambiguous:
 * every caption opens with `Comment "KEYWORD"`, which is enforced by the
 * publisher, and every campaign owns that keyword.
 *
 * Safe to run repeatedly. A campaign already bound is skipped.
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

const apply = process.argv.includes("--apply");

const { prisma } = await import("../lib/db/client");
const { decryptToken } = await import("../lib/meta/oauth");
const { getUserMedia } = await import("../lib/meta/client");

const account = await prisma.instagramAccount.findFirst();
if (!account?.accessToken) throw new Error("no connected Instagram account");
const media = await getUserMedia(decryptToken(account.accessToken), 25);

const carousels = media.filter(
  (m) => (m as { media_type?: string }).media_type === "CAROUSEL_ALBUM"
);
console.log(`${carousels.length} carousels in the last ${media.length} media items`);

const pending = await prisma.automation.findMany({
  where: { pendingNextReel: true, postId: null },
  select: { id: true, name: true, keywords: true },
});
console.log(`${pending.length} campaigns waiting for a post\n`);

let bound = 0;
for (const m of carousels) {
  const caption = (m as { caption?: string }).caption ?? "";
  // The publisher refuses any caption that does not open this way, so the
  // keyword is always here when the post came from this pipeline.
  const match = caption.match(/^Comment\s+"([^"]+)"/i);
  if (!match) continue;
  const keyword = match[1].toLowerCase();

  const campaign = pending.find((a) =>
    a.keywords.some((k) => k.toLowerCase() === keyword)
  );
  if (!campaign) continue;

  const permalink = (m as { permalink?: string }).permalink ?? null;
  console.log(`  "${keyword}" -> ${campaign.name}`);
  console.log(`     media ${m.id}  ${permalink ?? ""}`);

  if (apply) {
    await prisma.automation.update({
      where: { id: campaign.id },
      data: {
        postId: m.id,
        postUrl: permalink,
        pendingNextReel: false,
        isActive: true,
      },
    });
    console.log(`     bound and activated`);
  }
  bound += 1;
}

if (bound === 0) {
  console.log("nothing to bind - no published carousel matches a waiting campaign");
} else if (!apply) {
  console.log(`\n${bound} ready to bind (dry run - pass --apply)`);
} else {
  console.log(`\nbound ${bound}`);
}
await prisma.$disconnect();
process.exit(0);
