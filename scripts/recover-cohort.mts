/**
 * Who never got their opener, and is there any route left to them?
 *
 *   npx tsx scripts/recover-cohort.mts            # list the cohort
 *   npx tsx scripts/recover-cohort.mts --probe    # try both routes on ONE person
 *   npx tsx scripts/recover-cohort.mts --send     # run the working route for all
 *
 * The cohort is people with a matched comment, no delivered DM on any campaign,
 * and no conversation on the account. Conversations are paginated in full: the
 * unpaginated list returns 50, and we create threads by messaging, so a partial
 * read makes delivered people look thread-less and vice versa.
 */
import fs from "node:fs"; import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  process.env[line.slice(0,i).trim()] ??= line.slice(i+1).trim().replace(/^["']|["']$/g, "");
}
const mode = process.argv.includes("--send") ? "send"
  : process.argv.includes("--probe") ? "probe" : "list";

const { prisma } = await import("../lib/db/client");
const { decryptToken } = await import("../lib/meta/oauth");
const client = await import("../lib/meta/client");

const acc = await prisma.instagramAccount.findFirst();
const token = decryptToken(acc!.accessToken!);
const me = await client.getUserInfo(token);
const igUserId = (me as { user_id?: string; id: string }).user_id ?? me.id;

// ── every conversation, not the first page ────────────────────────────────
const known = new Set<string>();
let url: string | null =
  `https://graph.instagram.com/v25.0/${igUserId}/conversations` +
  `?platform=instagram&fields=participants&limit=50&access_token=${encodeURIComponent(token)}`;
let pages = 0;
while (url && pages < 40) {
  const j: { data?: { participants?: { data?: { id?: string }[] } }[]; paging?: { next?: string } } =
    await fetch(url).then((r) => r.json());
  for (const c of j.data ?? []) for (const p of c.participants?.data ?? []) if (p.id) known.add(p.id);
  url = j.paging?.next ?? null;
  pages += 1;
}
console.log(`conversations paginated: ${pages} page(s), ${known.size} distinct participants\n`);

const never = await prisma.dmLog.findMany({
  where: {
    dmSentAt: null,
    automation: { isActive: true },
  },
  select: {
    id: true, commenterId: true, commenterName: true, commentId: true,
    matchedKeyword: true, fallbackReplySentAt: true, createdAt: true,
    automation: { select: { id: true, name: true, keywords: true, dmMessage: true, linkButtonLabel: true,
                            trackedLinks: { select: { slug: true, label: true, destinationUrl: true, purpose: true } } } },
  },
  orderBy: { createdAt: "asc" },
});

const delivered = new Set(
  (await prisma.dmLog.findMany({ where: { dmSentAt: { not: null } }, select: { commenterId: true } }))
    .map((r) => r.commenterId)
);

const cohort = never.filter((r) => !delivered.has(r.commenterId) && !known.has(r.commenterId));
const withThread = never.filter((r) => !delivered.has(r.commenterId) && known.has(r.commenterId));

console.log(`never delivered, NO conversation : ${cohort.length}`);
console.log(`never delivered, HAS conversation: ${withThread.length}\n`);
for (const r of cohort) {
  console.log(`  @${(r.commenterName ?? "?").padEnd(24)} "${r.matchedKeyword}"  nudged=${r.fallbackReplySentAt ? "yes" : "NO"}  ${r.createdAt.toISOString().slice(0,16)}`);
}

if (mode === "list") { await prisma.$disconnect(); process.exit(0); }

// ── probe: one person, both routes, so the answer is measured ─────────────
const targets = mode === "probe" ? cohort.slice(0, 1) : cohort;
for (const r of targets) {
  const a = r.automation;
  const reveal = a.trackedLinks.find((l) => l.purpose === "REVEAL") ?? a.trackedLinks[0];
  const body = a.dmMessage.replace(/\{username\}/g, r.commenterName ?? "there").replace(/\{link\}/g, "");
  const buttons = reveal
    ? [{ title: a.linkButtonLabel || "get the guide", url: `https://openreply-psi-sepia.vercel.app/r/${reveal.slug}` }]
    : [];

  console.log(`\n--- @${r.commenterName} ---`);
  try {
    await client.sendPrivateReplyWithLinkButton(token, acc!.instagramId, r.commentId, body, buttons);
    console.log("  private reply: DELIVERED");
    await prisma.dmLog.update({ where: { id: r.id }, data: { status: "SENT", dmSentAt: new Date(), errorMessage: null } });
    continue;
  } catch (e) {
    console.log(`  private reply: ${e instanceof Error ? e.message.slice(0, 110) : e}`);
  }
  try {
    await client.sendDirectMessageWithLinkButton(token, acc!.instagramId, r.commenterId, body, buttons);
    console.log("  direct message: DELIVERED");
    await prisma.dmLog.update({ where: { id: r.id }, data: { status: "SENT", dmSentAt: new Date(), errorMessage: null } });
  } catch (e) {
    console.log(`  direct message: ${e instanceof Error ? e.message.slice(0, 110) : e}`);
  }
  await new Promise((x) => setTimeout(x, 4000));
}
await prisma.$disconnect(); process.exit(0);
