/**
 * Watch the connected account for the next reel and bind a waiting campaign
 * to it, then publish the campaign.
 *
 *   npx tsx scripts/bind-next-reel.mts <automationId> [--timeout-min 90] [--every 45]
 *   npx tsx scripts/bind-next-reel.mts <automationId> --once
 *
 * Instagram sends no webhook when a media is published, so this polls
 * /me/media. The daily Vercel cron does the same thing as a safety net, but at
 * 06:00 UTC only — far too late for a reel posted during the day, which is why
 * this exists.
 *
 * A reel only counts when it was posted AFTER the campaign was created, so an
 * existing back-catalogue reel can never be picked up by mistake. Exit code 0
 * means bound and live, 3 means the timeout passed with nothing new.
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

const { prisma } = await import("../lib/db/client");
const { getUserMedia } = await import("../lib/meta/client");
const { decryptToken } = await import("../lib/meta/oauth");

const automationId = process.argv[2];
if (!automationId) {
  console.error("usage: npx tsx scripts/bind-next-reel.mts <automationId> [--once]");
  process.exit(2);
}
const arg = (flag: string, fallback: number) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : Number(process.argv[i + 1]) || fallback;
};
const once = process.argv.includes("--once");
const everyMs = arg("--every", 45) * 1000;
const deadline = Date.now() + arg("--timeout-min", 90) * 60_000;

const automation = await prisma.automation.findUnique({
  where: { id: automationId },
  include: { instagramAccount: true },
});
if (!automation) throw new Error(`no campaign ${automationId}`);
if (!automation.instagramAccount.accessToken) throw new Error("account has no token");

const token = decryptToken(automation.instagramAccount.accessToken);
const createdAt = automation.createdAt;
console.error(
  `[bind] watching for a reel posted after ${createdAt.toISOString()} ` +
    `for "${automation.name}"`
);

async function findNewReel() {
  const media = await getUserMedia(token, 25);
  return media
    .filter((m) => m.media_product_type === "REELS")
    .filter((m) => new Date(m.timestamp) > createdAt)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];
}

while (true) {
  let reel;
  try {
    reel = await findNewReel();
  } catch (err) {
    // A transient Graph error should not end the watch.
    console.error("[bind] media fetch failed, retrying:", (err as Error).message);
  }

  if (reel) {
    const updated = await prisma.automation.update({
      where: { id: automationId },
      data: {
        postId: reel.id,
        postUrl: reel.permalink ?? null,
        pendingNextReel: false,
        isActive: true,
      },
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          bound: true,
          automationId: updated.id,
          isActive: updated.isActive,
          postId: reel.id,
          postUrl: reel.permalink ?? null,
          postedAt: reel.timestamp,
          caption: reel.caption?.slice(0, 160) ?? null,
        },
        null,
        2
      )
    );
    await prisma.$disconnect();
    process.exitCode = 0;
    break;
  }

  if (once || Date.now() >= deadline) break;
  await new Promise((r) => setTimeout(r, everyMs));
}

if (process.exitCode === undefined) {
  console.log(
    JSON.stringify({ ok: true, bound: false, reason: once ? "no-new-reel-yet" : "timeout" })
  );
  await prisma.$disconnect();
  process.exitCode = 3;
}
