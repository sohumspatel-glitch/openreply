import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { readActiveWorkspaceId } from "@/lib/active-workspace";
import { brandKeyForWorkspaceName } from "@/lib/branding";
import { ensureWorkspaceForUser, listWorkspacesForUser } from "@/lib/workspace";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const workspace = await ensureWorkspaceForUser(
    session.user.id,
    session.user.email,
    await readActiveWorkspaceId()
  );
  const [accounts, workspaces] = await Promise.all([
    prisma.instagramAccount.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { connectedAt: "desc" },
      select: { username: true },
    }),
    listWorkspacesForUser(session.user.id),
  ]);

  return (
    <DashboardShell
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      brandKey={brandKeyForWorkspaceName(workspace.name)}
      workspaces={workspaces.map(({ id, name }) => ({ id, name }))}
      instagramUsername={accounts[0]?.username ?? null}
      instagramAccountCount={accounts.length}
    >
      {children}
    </DashboardShell>
  );
}
