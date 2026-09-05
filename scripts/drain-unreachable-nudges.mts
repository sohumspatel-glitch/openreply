/**
 * Post the "DM me the keyword" nudge to everyone it was silently dropped for.
 *
 *   npx tsx scripts/drain-unreachable-nudges.mts [--apply] [--max 40]
 *
 * When Instagram refuses to open a DM thread (code 100 / subcode 2534001) the
 * worker posts a public reply telling the commenter to message first, because
 * an inbound DM opens the thread a private reply cannot. That nudge is gated
 * on the hourly comment-reply budget, and when the budget is spent the call
 * returns early and the nudge is simply lost: `fallbackReplySentAt` stays null,
 * but the comment is already past MAX_DM_ATTEMPTS, so the sweep never picks it
 * up again. The person ends with no DM and no explanation.
 *
 * This drains that backlog out of band. It deliberately does NOT go through the
 * worker: replying to comments is the API surface that earned this account an
 * action block (error 368) once already, so the pacing here is conservative and
 * the budget is respected rather than worked around.
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
const MAX = process.argv.includes("--max")
  ? Number(process.argv[process.argv.indexOf("--max") + 1])
  : 40;

/**
 * Seconds between nudges. Three minutes by default (20/hour, the documented
 * budget), but a short backlog can go faster without approaching the cap —
 * ten replies is ten replies whether they take three minutes or thirty, and
 * the action block came from unbounded volume, not from cadence.
 */
const PACE_MS =
  (process.argv.includes("--pace")
    ? Number(process.argv[process.argv.indexOf("--pace") + 1])
    : 180) * 1000;

const { prisma } = await import("../lib/db/client");
const { decryptToken } = await import("../lib/meta/oauth");
const { sendCommentReply } = await import("../lib/meta/client");
const { getRedisConnection } = await import("../lib/queue/client");

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Selected by outcome, not by error text. Filtering on "2534001" missed people
// whose single attempt failed some other way — a stale comment id, a scope
// error — who are just as unreachable and just as owed an explanation. What
// matters is: nothing was delivered, and nobody has told them why.
const stuck = await prisma.dmLog.findMany({
  where: {
    dmSentAt: null,
    fallbackReplySentAt: null,
    automation: { isActive: true },
  },
  select: {
    id: true,
    commentId: true,
    commenterName: true,
    automation: {
      select: {
        id: true,
        keywords: true,
        dmTriggerEnabled: true,
        publicReplyEnabled: true,
        instagramAccount: { select: { instagramId: true, accessToken: true } },
      },
    },
  },
  orderBy: { createdAt: "asc" },
  take: MAX,
});

console.log(`unreachable, never nudged: ${stuck.length}`);
for (const s of stuck) {
  console.log(`  @${s.commenterName}  keyword "${s.automation.keywords[0] ?? "?"}"`);
}
if (!apply) {
  console.log(`\n(dry run — pass --apply; will pace one every ${PACE_MS / 60000} min)`);
  await prisma.$disconnect();
  process.exit(0);
}

// The budget counter climbs even on a refusal, so a window that is already
// over the cap has to be waited out rather than pushed through.
const redis = getRedisConnection();
const key = `rate:comment:${stuck[0]?.automation.instagramAccount?.instagramId}`;
const spent = Number((await redis.get(key)) ?? 0);
console.log(`comment budget spent this hour: ${spent}/20`);
if (spent >= 20) {
  const ttl = await redis.ttl(key);
  console.log(`\nbudget spent (${spent}/20). Waiting ${ttl}s for the window to reset.`);
  await sleep(Math.max(ttl, 1) * 1000 + 5000);
}

let sent = 0;
for (const [i, s] of stuck.entries()) {
  const a = s.automation;
  const keyword = a.keywords[0];
  const token = a.instagramAccount?.accessToken;
  if (!keyword || !token || !a.dmTriggerEnabled || !a.publicReplyEnabled) {
    console.log(`  skip @${s.commenterName}: campaign cannot support a nudge`);
    continue;
  }
  try {
    await sendCommentReply(
      decryptToken(token),
      s.commentId,
      `instagram won't let me DM you first — send me "${keyword}" in a DM and it'll come straight through 🙌`
    );
    await prisma.dmLog.update({
      where: { id: s.id },
      data: { fallbackReplySentAt: new Date() },
    });
    sent += 1;
    console.log(`  [${i + 1}/${stuck.length}] nudged @${s.commenterName}`);
  } catch (error) {
    console.log(
      `  [${i + 1}/${stuck.length}] @${s.commenterName} failed: ${
        error instanceof Error ? error.message.slice(0, 120) : String(error)
      }`
    );
  }
  if (i < stuck.length - 1) await sleep(PACE_MS);
}

console.log(`\nnudged ${sent} of ${stuck.length}`);
await prisma.$disconnect();
process.exit(0);
