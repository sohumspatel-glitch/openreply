/**
 * Who commented on a post while its campaign was still unbound.
 *
 * A campaign bound after the fact has no record of anything that happened
 * before: DmLog only holds comments the worker actually saw. So this reads the
 * comments off Instagram and diffs them against what we logged.
 */
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () { return this.toString(); };
import fs from "node:fs"; import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  process.env[line.slice(0,i).trim()] ??= line.slice(i+1).trim().replace(/^["']|["']$/g, "");
}
const { prisma } = await import("../lib/db/client");
const { decryptToken } = await import("../lib/meta/oauth");
const { getRecentMediaComments } = await import("../lib/meta/client");
const { matchKeywords } = await import("../lib/utils/keyword-matcher");

const a = await prisma.automation.findFirst({
  // "Carousel D1" also prefixes "Carousel D10". Select on the keyword, which
  // is unique by construction.
  where: { keywords: { has: "intel" } },
  include: { instagramAccount: true },
});
if (!a?.postId) throw new Error("campaign is not bound");
const token = decryptToken(a.instagramAccount!.accessToken!);

const since = Date.now() - 48 * 3600 * 1000;
const comments = await getRecentMediaComments(token, a.postId, since);
console.log(`post ${a.postId}  (${a.postUrl})`);
console.log(`${comments.length} comments in the last 48h\n`);

const logged = new Set(
  (await prisma.dmLog.findMany({ where: { automationId: a.id }, select: { commentId: true } }))
    .map((r) => r.commentId)
);

let matched = 0, missed = 0;
for (const c of comments) {
  if (!c.from?.id || c.from.id === a.instagramAccount!.instagramId) continue;
  const hit = matchKeywords(c.text ?? "", a.keywords, a.wholeWordMatch);
  if (!hit.matched) continue;
  matched += 1;
  const seen = logged.has(c.id);
  if (!seen) missed += 1;
  console.log(`  ${seen ? "logged " : "MISSED "} @${(c.from.username ?? "?").padEnd(22)} "${(c.text ?? "").slice(0,26)}"  ${c.timestamp?.slice(0,16)}`);
}
console.log(`\n${matched} matched the keyword, ${missed} never reached the worker`);
await prisma.$disconnect(); process.exit(0);
