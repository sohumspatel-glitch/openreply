/**
 * Give back a DM to everyone the outbound guard refused by mistake.
 *
 *   npx tsx scripts/recover-blocked-sends.mts [--apply]
 *
 * A claim held on an ordinary refusal used to be permanent, so a first attempt
 * that failed for a mundane reason left the person locked out: DmLog FAILED,
 * dmSentAt null, error "Already sent this exact message". They received
 * nothing. This clears the stale locks and hands the comments back to the
 * sweep.
 *
 * Only rows that never delivered are touched. A row with dmSentAt set is left
 * exactly as it is — the whole point is not to send anyone a second copy.
 */
import fs from "node:fs"; import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  process.env[line.slice(0,i).trim()] ??= line.slice(i+1).trim().replace(/^["']|["']$/g, "");
}
const apply = process.argv.includes("--apply");
const { prisma } = await import("../lib/db/client");
const { getRedisConnection } = await import("../lib/queue/client");

const blocked = await prisma.dmLog.findMany({
  where: {
    status: "FAILED",
    dmSentAt: null,
    errorMessage: { contains: "Already sent this exact message" },
  },
  select: { id: true, commenterName: true, commentId: true, attempts: true, automationId: true },
});

console.log(`blocked by a stale claim, never delivered: ${blocked.length}`);
for (const b of blocked) console.log(`  @${b.commenterName}  comment ${b.commentId}  attempts=${b.attempts}`);

if (!apply) { console.log("\n(dry run — pass --apply)"); await prisma.$disconnect(); process.exit(0); }

// The fingerprint depends on the payload, which is not stored, so the dup keys
// are cleared wholesale. Safe: they carry a 6h TTL, the daily destination cap
// still applies, and every already-delivered row is marked SENT so the worker
// skips it before a send is ever attempted.
const redis = getRedisConnection();
const dupKeys = await redis.keys("og:dup:*");
if (dupKeys.length) await redis.del(...dupKeys);
console.log(`\ncleared ${dupKeys.length} duplicate locks`);

const reset = await prisma.dmLog.updateMany({
  where: { id: { in: blocked.map((b) => b.id) } },
  data: { status: "PENDING", attempts: 0, errorMessage: null },
});
console.log(`reset ${reset.count} rows to PENDING for the sweep to retry`);
await prisma.$disconnect();
process.exit(0);
