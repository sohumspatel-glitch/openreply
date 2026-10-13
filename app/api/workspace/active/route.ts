import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import {
  ACTIVE_WORKSPACE_COOKIE,
  activeWorkspaceCookieOptions,
  isPlausibleWorkspaceId,
} from "@/lib/active-workspace";

/** Switch the active workspace. Only to one the caller is a member of. */
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  const workspaceId = body?.workspaceId;
  if (!isPlausibleWorkspaceId(workspaceId)) {
    return NextResponse.json(
      { success: false, error: "Invalid workspace" },
      { status: 400 }
    );
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { workspaceId: true },
  });
  if (!membership) {
    return NextResponse.json(
      { success: false, error: "Workspace not found" },
      { status: 404 }
    );
  }

  const response = NextResponse.json({ success: true, data: { workspaceId } });
  response.cookies.set(
    ACTIVE_WORKSPACE_COOKIE,
    workspaceId,
    activeWorkspaceCookieOptions
  );
  return response;
}
