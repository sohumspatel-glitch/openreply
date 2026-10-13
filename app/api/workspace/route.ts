import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import {
  ACTIVE_WORKSPACE_COOKIE,
  activeWorkspaceCookieOptions,
  readActiveWorkspaceId,
} from "@/lib/active-workspace";
import {
  createWorkspaceForUser,
  getWorkspaceMembership,
  listWorkspacesForUser,
  normalizeWorkspaceName,
  WORKSPACE_NAME_MAX_LENGTH,
} from "@/lib/workspace";

/** The user's workspaces and which one is active. */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const [workspaces, active] = await Promise.all([
    listWorkspacesForUser(userId),
    getWorkspaceMembership(userId, await readActiveWorkspaceId()),
  ]);

  return NextResponse.json({
    success: true,
    data: { workspaces, activeWorkspaceId: active?.workspace.id ?? null },
  });
}

/**
 * Create a workspace owned by the caller and switch to it.
 *
 * A new workspace starts empty: no Instagram account, no campaigns. Connecting
 * Instagram while it is active attaches the account to it, because the connect
 * route reads the active workspace.
 */
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  const name = normalizeWorkspaceName(body?.name);
  if (!name) {
    return NextResponse.json(
      {
        success: false,
        error: `Workspace name must be 1 to ${WORKSPACE_NAME_MAX_LENGTH} characters`,
      },
      { status: 400 }
    );
  }

  // Branding and the guide-campaign scripts both key off the name, so two
  // workspaces with the same name would make "which one is Settr" ambiguous.
  const existing = await listWorkspacesForUser(userId);
  if (existing.some((w) => w.name.trim().toLowerCase() === name.toLowerCase())) {
    return NextResponse.json(
      { success: false, error: "You already have a workspace with that name" },
      { status: 409 }
    );
  }

  const workspace = await createWorkspaceForUser(userId, name);
  const response = NextResponse.json({
    success: true,
    data: { id: workspace.id, name: workspace.name },
  });
  response.cookies.set(
    ACTIVE_WORKSPACE_COOKIE,
    workspace.id,
    activeWorkspaceCookieOptions
  );
  return response;
}
