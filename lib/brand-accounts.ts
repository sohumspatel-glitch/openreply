/**
 * Pick the connected account a brand's CLI work must land on.
 *
 * The scripts used to take "the first Instagram account", which was right
 * while there was one brand. With a Settr workspace beside the Startscalr one,
 * "first" could put a Settr campaign on @startscalr (or the reverse), and a
 * campaign on the wrong account DMs the wrong audience. So the choice is made
 * by brand, through the workspace the account belongs to:
 *
 *   - every account is classed by its workspace name (lib/branding.ts)
 *   - only accounts of the requested brand are candidates, ever
 *   - a username, when given, must match one of those candidates exactly
 *   - with no username, the brand's oldest account wins, which for Startscalr
 *     is exactly the account the scripts picked before brands existed
 *
 * Pure: the caller loads the accounts (with their workspace name, oldest
 * first), so this stays testable without a database.
 */
import { brandKeyForWorkspaceName, type BrandKey } from "./branding";

export interface BrandAccountCandidate {
  username: string;
  workspace: { name: string };
}

export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

/** Pure selection over already-loaded accounts (oldest first). */
export function selectBrandAccount<T extends BrandAccountCandidate>(
  accounts: T[],
  brand: BrandKey,
  username?: string | null
): T {
  const ofBrand = accounts.filter(
    (a) => brandKeyForWorkspaceName(a.workspace.name) === brand
  );

  if (ofBrand.length === 0) {
    throw new Error(
      brand === "settr"
        ? 'no account is connected to a workspace named "Settr". Create the Settr workspace, switch to it, and connect @trysettr first.'
        : `no account is connected to a ${brand} workspace`
    );
  }

  if (username) {
    const wanted = normalizeHandle(username);
    const match = ofBrand.find((a) => normalizeHandle(a.username) === wanted);
    if (!match) {
      throw new Error(
        `@${wanted} is not connected to the ${brand} workspace (connected there: ${ofBrand
          .map((a) => `@${a.username}`)
          .join(", ")})`
      );
    }
    return match;
  }

  return ofBrand[0];
}

/**
 * Refuse to act on a campaign whose account is not the one the caller named.
 * For the bind scripts, which find the account through the campaign itself.
 */
export function assertCampaignAccount(
  account: { username: string; workspace?: { name: string } | null },
  expected: { username?: string | null; brand?: BrandKey | null }
): void {
  if (
    expected.username &&
    normalizeHandle(account.username) !== normalizeHandle(expected.username)
  ) {
    throw new Error(
      `campaign is on @${account.username}, not @${normalizeHandle(expected.username)}; refusing`
    );
  }
  if (expected.brand && account.workspace) {
    const actual = brandKeyForWorkspaceName(account.workspace.name);
    if (actual !== expected.brand) {
      throw new Error(
        `campaign is on a ${actual} account (@${account.username}), not ${expected.brand}; refusing`
      );
    }
  }
}
