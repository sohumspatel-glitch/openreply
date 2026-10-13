import { prisma } from "@/lib/db/client";
import type { Workspace, WorkspaceRole } from "@/app/generated/prisma/client";

function normalizeInviteEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function acceptPendingInvitationsForUser(
  userId: string,
  email?: string | null
): Promise<void> {
  if (!email) return;

  const normalizedEmail = normalizeInviteEmail(email);
  const now = new Date();
  const invitations = await prisma.workspaceInvitation.findMany({
    where: {
      email: normalizedEmail,
      status: "PENDING",
      expiresAt: { gt: now },
    },
  });

  for (const invitation of invitations) {
    await prisma.$transaction([
      prisma.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: invitation.workspaceId,
            userId,
          },
        },
        create: {
          workspaceId: invitation.workspaceId,
          userId,
          role: invitation.role,
        },
        update: {
          role: invitation.role,
        },
      }),
      prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: now,
        },
      }),
    ]);
  }
}

/**
 * The workspace a user is working in.
 *
 * `preferredWorkspaceId` is the workspace they last switched to (the
 * active-workspace cookie). It is honoured only when the user is actually a
 * member of it, so a stale or forged id can never reach another tenant: it
 * silently falls back to the oldest membership, which is what every caller got
 * before switching existed.
 */
export async function getWorkspaceMembership(
  userId: string,
  preferredWorkspaceId?: string | null
): Promise<{
  workspace: Workspace;
  role: WorkspaceRole;
} | null> {
  if (preferredWorkspaceId) {
    const preferred = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: preferredWorkspaceId, userId },
      },
      include: { workspace: true },
    });
    if (preferred) {
      return { workspace: preferred.workspace, role: preferred.role };
    }
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) return null;

  return {
    workspace: membership.workspace,
    role: membership.role,
  };
}

export async function ensureWorkspaceForUser(
  userId: string,
  email?: string | null,
  preferredWorkspaceId?: string | null
): Promise<Workspace> {
  await acceptPendingInvitationsForUser(userId, email);

  const existingMembership = await getWorkspaceMembership(
    userId,
    preferredWorkspaceId
  );
  if (existingMembership) {
    return existingMembership.workspace;
  }

  const workspaceName = email ? `${email.split("@")[0]}'s workspace` : "My workspace";

  return prisma.workspace.create({
    data: {
      name: workspaceName,
      ownerId: userId,
      members: {
        create: {
          userId,
          role: "OWNER",
        },
      },
    },
  });
}

export async function getPrimaryWorkspace(
  userId: string,
  preferredWorkspaceId?: string | null
): Promise<Workspace | null> {
  const membership = await getWorkspaceMembership(userId, preferredWorkspaceId);
  return membership?.workspace ?? null;
}

/** Every workspace the user belongs to, oldest first (the default one first). */
export async function listWorkspacesForUser(userId: string): Promise<
  Array<{ id: string; name: string; role: WorkspaceRole }>
> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: { workspace: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    role: m.role,
  }));
}

export const WORKSPACE_NAME_MAX_LENGTH = 60;

/** Trimmed, length-checked workspace name, or null when unusable. */
export function normalizeWorkspaceName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > WORKSPACE_NAME_MAX_LENGTH) return null;
  return trimmed;
}

/** A new workspace owned by `userId`, who becomes its OWNER member. */
export async function createWorkspaceForUser(
  userId: string,
  name: string
): Promise<Workspace> {
  return prisma.workspace.create({
    data: {
      name,
      ownerId: userId,
      members: { create: { userId, role: "OWNER" } },
    },
  });
}
