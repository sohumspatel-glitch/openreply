/**
 * Read-only stats for the Settr Telegram bot (settr-social-agent/bridge/telegram.mjs).
 *
 *   npx tsx scripts/settr-insights.mts dms              comment-to-DM numbers per Settr campaign
 *   npx tsx scripts/settr-insights.mts ig [count]       Instagram insights for @trysettr's latest posts
 *   npx tsx scripts/settr-insights.mts ig <url|mediaId> insights for one post
 *
 * Never writes to the database and never calls a Meta endpoint that changes anything: it only
 * reads DmLog/Automation rows and GETs media + insights with the account's own token. Output is
 * plain text sized for a Telegram message.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const { prisma } = await import("../lib/db/client");
const { decryptToken } = await import("../lib/meta/oauth");
const { getMetaGraphApiVersion } = await import("../lib/env");

const USERNAME = "trysettr";
const [mode = "dms", arg] = process.argv.slice(2);

try {
  if (mode === "dms") await dms();
  else if (mode === "ig") await ig(arg);
  else console.log("usage: settr-insights.mts dms | ig [count|url|mediaId]");
} finally {
  await prisma.$disconnect();
}

async function dms() {
  const account = await prisma.instagramAccount.findFirst({ where: { username: USERNAME } });
  if (!account) return console.log("@trysettr is not connected to OpenReply.");
  const automations = await prisma.automation.findMany({
    where: { instagramAccountId: account.id },
    select: { id: true, name: true, keywords: true, isActive: true, postUrl: true },
    orderBy: { createdAt: "desc" },
  });
  if (!automations.length) return console.log("No Settr campaigns yet.");
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const lines = ["Comment-to-DM (Settr, @trysettr)"];
  for (const a of automations) {
    const all = await prisma.dmLog.groupBy({ by: ["status"], where: { automationId: a.id }, _count: true });
    const week = await prisma.dmLog.count({ where: { automationId: a.id, status: "SENT", createdAt: { gte: weekAgo } } });
    const n = (s: string) => all.find((x) => x.status === s)?._count ?? 0;
    const skipped = all.filter((x) => String(x.status).startsWith("SKIPPED")).reduce((t, x) => t + x._count, 0);
    lines.push(
      "",
      `${a.name}`,
      `Keyword: ${a.keywords[0] ?? "none"} · ${a.isActive ? "live" : "off"}${a.postUrl ? "" : " · not bound to a post yet"}`,
      `Sent ${n("SENT")} (${week} this week) · pending ${n("PENDING")} · failed ${n("FAILED")} · skipped ${skipped}`,
    );
  }
  console.log(lines.join("\n"));
}

async function ig(target?: string) {
  const account = await prisma.instagramAccount.findFirst({ where: { username: USERNAME } });
  if (!account) return console.log("@trysettr is not connected to OpenReply.");
  const token = decryptToken(account.accessToken);
  const base = `https://graph.instagram.com/${getMetaGraphApiVersion()}`;
  const get = async (p: string) => {
    const res = await fetch(`${base}${p}${p.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`);
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new Error((json.error as { message?: string })?.message || `HTTP ${res.status}`);
    return json;
  };

  type Media = { id: string; caption?: string; permalink?: string; timestamp?: string; media_type?: string };
  const fields = "id,caption,permalink,timestamp,media_type";
  let media: Media[];
  if (target && !/^\d{1,2}$/.test(target)) {
    if (/^\d+$/.test(target)) media = [(await get(`/${target}?fields=${fields}`)) as Media];
    else {
      const recent = ((await get(`/me/media?fields=${fields}&limit=50`)).data as Media[]) || [];
      const want = target.replace(/\/$/, "").split("?")[0];
      media = recent.filter((m) => m.permalink?.replace(/\/$/, "") === want);
      if (!media.length) return console.log("Couldn't find that post among @trysettr's last 50.");
    }
  } else {
    const count = Math.min(Number(target) || 5, 10);
    media = ((await get(`/me/media?fields=${fields}&limit=${count}`)).data as Media[]) || [];
  }
  if (!media.length) return console.log("@trysettr has no posts yet.");

  const lines = ["Instagram insights (@trysettr)"];
  for (const m of media) {
    const title = (m.caption || "(no caption)").split("\n")[0].slice(0, 60);
    const when = m.timestamp ? new Date(m.timestamp).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }) : "";
    let stats = "";
    try {
      const metrics = "reach,views,likes,comments,saved,shares";
      const data = ((await get(`/${m.id}/insights?metric=${metrics}`)).data as { name: string; values?: { value: number }[]; total_value?: { value: number } }[]) || [];
      const v = (k: string) => {
        const row = data.find((d) => d.name === k);
        return row?.total_value?.value ?? row?.values?.[0]?.value ?? "-";
      };
      stats = `reach ${v("reach")} · views ${v("views")} · likes ${v("likes")} · comments ${v("comments")} · saves ${v("saved")} · shares ${v("shares")}`;
    } catch (e) {
      stats = `insights unavailable (${(e as Error).message.slice(0, 80)})`;
    }
    lines.push("", `${when} · ${m.media_type?.toLowerCase().replace("_", " ") ?? ""} · ${title}`, stats, m.permalink ?? "");
  }
  console.log(lines.join("\n"));
}
