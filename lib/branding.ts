/**
 * Per-workspace branding for the dashboard chrome.
 *
 * One install serves more than one company, and the sidebar should say which
 * one you are looking at. The brand is chosen from the workspace NAME, so no
 * schema change is needed: a workspace called "Settr" (any case, surrounding
 * whitespace ignored) gets the Settr mark; every other workspace keeps the
 * original Startscalr look, untouched.
 *
 * Pure and dependency-free so the client sidebar, the server layout and the
 * CLI scripts can all import it.
 */

export type BrandKey = "startscalr" | "settr";

export interface Brand {
  key: BrandKey;
  /** Text shown as the sidebar wordmark. */
  name: string;
  /** Square mark shown beside the name, served from /public. Null = text only. */
  iconSrc: string | null;
  /**
   * Accent for the brand mark and the active nav state, or null to keep the
   * stock tan/copper. Applied through a CSS scope (see .glass-ink[data-brand]
   * in globals.css), never to the rest of the UI.
   */
  accent: string | null;
}

export const BRANDS: Record<BrandKey, Brand> = {
  startscalr: {
    key: "startscalr",
    name: "Startscalr",
    iconSrc: null,
    accent: null,
  },
  settr: {
    key: "settr",
    name: "Settr",
    iconSrc: "/brands/settr.png",
    accent: "#34d39a",
  },
};

export const DEFAULT_BRAND_KEY: BrandKey = "startscalr";

/** Which brand a workspace belongs to, from its name. */
export function brandKeyForWorkspaceName(
  workspaceName: string | null | undefined
): BrandKey {
  return workspaceName?.trim().toLowerCase() === "settr"
    ? "settr"
    : DEFAULT_BRAND_KEY;
}

export function getBrandForWorkspaceName(
  workspaceName: string | null | undefined
): Brand {
  return BRANDS[brandKeyForWorkspaceName(workspaceName)];
}
