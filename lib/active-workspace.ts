/**
 * Which workspace the signed-in user is currently working in.
 *
 * Stored as a plain cookie holding a workspace id. It is only a PREFERENCE:
 * every reader passes it to getWorkspaceMembership, which honours it only when
 * the user is a member of that workspace and otherwise falls back to their
 * oldest membership. With no cookie set, behaviour is exactly what it was
 * before switching existed.
 */
import { cookies } from "next/headers";

export const ACTIVE_WORKSPACE_COOKIE = "openreply_workspace";

/** One year. The choice should survive restarts, not expire mid-week. */
export const ACTIVE_WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Workspace ids are cuids; anything else is not worth a database lookup. */
export function isPlausibleWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{10,64}$/i.test(value);
}

/**
 * The active-workspace preference from the request cookies, or null.
 * Never throws: outside a request scope (scripts, workers) there is no
 * preference, which means "use the default workspace".
 */
export async function readActiveWorkspaceId(): Promise<string | null> {
  try {
    const value = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value;
    return isPlausibleWorkspaceId(value) ? value : null;
  } catch {
    return null;
  }
}

export const activeWorkspaceCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ACTIVE_WORKSPACE_COOKIE_MAX_AGE,
};
