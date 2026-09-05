/**
 * Emergency stop. Pause the DM queue and deactivate every automation.
 *
 *   npx tsx scripts/_halt.mts
 *
 * Two switches because they stop different things: deactivating automations
 * stops new jobs being enqueued, pausing the queue stops the jobs already
 * sitting in it (including delayed follow-ups) from running. Either alone
 * leaves sending in progress.
 */
import fs from "node:fs"; import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  process.env[line.slice(0,i).trim()] ??= line.slice(i+1).trim().replace(/^["']|["']$/g, "");
}
const { prisma } = await import("../lib/db/client");
const { getDMQueue } = await import("../lib/queue/client");

const q = getDMQueue();
await q.pause();
const counts = await q.getJobCounts();

const off = await prisma.automation.updateMany({
  where: { isActive: true },
  data: { isActive: false },
});

console.log(JSON.stringify({ queuePaused: true, counts, automationsDeactivated: off.count }, null, 2));
await prisma.$disconnect();
process.exit(0);
