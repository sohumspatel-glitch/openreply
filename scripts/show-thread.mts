/**
 * Print the real Instagram DM thread with one commenter, from Meta, so what a
 * person actually received is read off the platform rather than inferred from
 * our own logs. DmLog records one row per comment; it cannot show a message
 * that got re-sent on a retry, which is exactly what a spam report looks like.
 *
 *   npx tsx scripts/_thread.mts <igUsername> [<igUsername> ...]
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

const want = new Set(process.argv.slice(2).map((s) => s.toLowerCase().replace(/^@/, "")));
const account = await prisma.instagramAccount.findFirst();
if (!account?.accessToken) throw new Error("no account");
const token = decryptToken(account.accessToken);
const me = await getUserInfo(token);
const igUserId = (me as { user_id?: string; id: string }).user_id ?? me.id;

const convos = await getConversations(token, igUserId);
for (const c of convos) {
  const parts = (c as { participants?: { data?: { username?: string; id?: string }[] } }).participants?.data ?? [];
  const other = parts.find((p) => (p.username ?? "").toLowerCase() !== (me.username ?? "").toLowerCase());
  const uname = (other?.username ?? "").toLowerCase();
  if (want.size && !want.has(uname)) continue;
  const msgs = await getConversationMessages(token, c.id);
  console.log(`\n=== @${uname}  (${msgs.length} messages returned) ===`);
  for (const m of [...msgs].reverse()) {
    const from = (m as { from?: { username?: string } }).from?.username ?? "?";
    const att = (m as { attachments?: { data?: unknown[] } }).attachments?.data?.length ?? 0;
    const text = String((m as { message?: string }).message ?? "").replace(/\s+/g, " ").slice(0, 95);
    console.log(`  ${(m as { created_time: string }).created_time}  ${from.padEnd(20)} ${att ? `[${att} att] ` : ""}${text}`);
  }
}
await prisma.$disconnect();
process.exit(0);
