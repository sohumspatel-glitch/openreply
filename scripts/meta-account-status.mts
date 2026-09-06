/**
 * Is the live Instagram integration still working?
 *
 * Written because the developer dashboard started returning "You cannot
 * access this service." The dashboard and the API are different surfaces, and
 * the only thing that matters operationally is whether the token still reads
 * and whether Meta still accepts a send. This asks Meta directly rather than
 * inferring it from our own logs, which is the mistake that hid the duplicate
 * sends.
 *
 * Read-only: it never sends a message.
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
const { decryptToken } = await import("../lib/meta/oauth");

const version = process.env.META_GRAPH_API_VERSION ?? "v25.0";
const accounts = await prisma.instagramAccount.findMany({
  select: {
    id: true,
    username: true,
    instagramId: true,
    platform: true,
    accessToken: true,
    tokenExpiresAt: true,
    webhookSubscribed: true,
  },
});

console.log(`${accounts.length} connected account(s)\n`);

for (const account of accounts) {
  console.log(`--- @${account.username} (${account.platform}) ---`);
  console.log(
    `  token expires: ${account.tokenExpiresAt?.toISOString() ?? "no expiry recorded"}`
  );
  console.log(`  webhook subscribed (our record): ${account.webhookSubscribed}`);

  let token: string;
  try {
    token = decryptToken(account.accessToken);
  } catch (error) {
    console.log(`  DECRYPT FAILED: ${(error as Error).message}\n`);
    continue;
  }

  // 1. Does the token still resolve? A revoked or app-blocked token fails here
  //    with code 190.
  const meUrl =
    `https://graph.instagram.com/${version}/me` +
    `?fields=id,user_id,username,account_type&access_token=${encodeURIComponent(token)}`;
  const me = await fetch(meUrl).then((r) => r.json());
  if (me.error) {
    console.log(
      `  TOKEN READ FAILED: ${me.error.message} [code=${me.error.code} sub=${me.error.error_subcode ?? "-"}]`
    );
  } else {
    console.log(`  token reads ok: @${me.username} (${me.account_type ?? "?"})`);
  }

  // 2. Is the app still subscribed to this account's webhooks? This is the
  //    field that would go quiet first if the app were restricted, and it is
  //    read from Meta rather than from our own boolean above.
  const subUrl =
    `https://graph.instagram.com/${version}/${account.instagramId}/subscribed_apps` +
    `?access_token=${encodeURIComponent(token)}`;
  const subs = await fetch(subUrl).then((r) => r.json());
  if (subs.error) {
    console.log(
      `  SUBSCRIPTION READ FAILED: ${subs.error.message} [code=${subs.error.code}]`
    );
  } else {
    console.log(`  subscriptions per Meta: ${JSON.stringify(subs.data ?? subs)}`);
  }

  console.log();
}

await prisma.$disconnect();
