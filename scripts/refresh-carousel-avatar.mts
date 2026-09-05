/**
 * Pull the live @startscalr_sohum profile picture into the carousel tooling.
 *
 *   npx tsx scripts/refresh-carousel-avatar.mts
 *
 * The tweet card should show whatever the account shows today, so the avatar is
 * fetched before a render rather than kept as a stale copy on disk. Lives here
 * rather than beside the renderer because this is where the Instagram client
 * and the encrypted token already are.
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

// Forward slashes on purpose: Node accepts them on Windows, and they survive
// every layer of shell and heredoc escaping that mangles backslashes.
const OUT =
  "C:/Users/sohum/OneDrive/Desktop/Startscalr/_products/startscalr-automations/startscalr-content-engine/carousel/assets/avatar.jpg";

const { prisma } = await import("../lib/db/client");
const { decryptToken } = await import("../lib/meta/oauth");
const { getUserInfo } = await import("../lib/meta/client");

const account = await prisma.instagramAccount.findFirst();
if (!account?.accessToken) throw new Error("no connected Instagram account");
const info = await getUserInfo(decryptToken(account.accessToken));
await prisma.$disconnect();

const url = (info as { profile_picture_url?: string }).profile_picture_url;
if (!url) throw new Error("Instagram returned no profile_picture_url");

const res = await fetch(url);
if (!res.ok) throw new Error(`avatar fetch failed: ${res.status}`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.from(await res.arrayBuffer()));

console.log(`avatar refreshed for @${info.username} -> ${OUT}`);
