/**
 * How many people were sent duplicate DMs, and how many messages each got.
 * Read from Meta, because our own logs record one row per comment and are
 * exactly the thing that under-counted this.
 */
import fs from "node:fs"; import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  process.env[line.slice(0,i).trim()] ??= line.slice(i+1).trim().replace(/^["']|["']$/g, "");
}
const { prisma } = await import("../lib/db/client");
const { decryptToken } = await import("../lib/meta/oauth");
const { getConversations, getConversationMessages, getUserInfo } = await import("../lib/meta/client");

const account = await prisma.instagramAccount.findFirst();
const token = decryptToken(account!.accessToken!);
const me = await getUserInfo(token);
const igUserId = (me as { user_id?: string; id: string }).user_id ?? me.id;
const mine = (me.username ?? "").toLowerCase();
const since = Date.now() - 24 * 3600 * 1000;

const convos = await getConversations(token, igUserId);
const rows: { user: string; outbound24h: number; last: string }[] = [];
let latest = "";
for (const c of convos) {
  const parts = (c as { participants?: { data?: { username?: string }[] } }).participants?.data ?? [];
  const other = parts.find((p) => (p.username ?? "").toLowerCase() !== mine)?.username ?? "?";
  const msgs = await getConversationMessages(token, c.id);
  const out = msgs.filter((m) => {
    const from = (m as { from?: { username?: string } }).from?.username ?? "";
    const t = Date.parse((m as { created_time: string }).created_time);
    return from.toLowerCase() === mine && t > since;
  });
  if (out.length === 0) continue;
  const last = out.map((m) => (m as { created_time: string }).created_time).sort().pop()!;
  if (last > latest) latest = last;
  rows.push({ user: other, outbound24h: out.length, last });
}
rows.sort((a, b) => b.outbound24h - a.outbound24h);
console.log(JSON.stringify({
  now: new Date().toISOString(),
  mostRecentOutboundAnywhere: latest,
  conversationsTouched24h: rows.length,
  totalOutbound24h: rows.reduce((s, r) => s + r.outbound24h, 0),
  over4Messages: rows.filter((r) => r.outbound24h > 4).length,
  worst: rows.slice(0, 12),
}, null, 2));
await prisma.$disconnect();
process.exit(0);
