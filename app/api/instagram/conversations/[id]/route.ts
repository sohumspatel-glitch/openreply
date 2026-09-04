import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { getConversationMessages, MetaApiError } from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";

/** A tappable link on a template card. */
export interface ThreadButton {
  title: string;
  url: string | null;
}

/**
 * One rendered part of a message. Every automation we send arrives as a
 * `template`; people send `image` / `video` / `file`.
 */
export interface ThreadAttachment {
  kind: "template" | "image" | "video" | "file";
  title: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  buttons: ThreadButton[];
}

export interface ThreadMessage {
  id: string;
  text: string;
  fromMe: boolean;
  fromUsername: string | null;
  createdTime: string | null;
  attachments: ThreadAttachment[];
}

export interface ThreadResponse {
  messages: ThreadMessage[];
}

type RouteProps = { params: Promise<{ id: string }> };

// Message history for a single conversation (20 most recent, chronological).
export async function GET(request: NextRequest, { params }: RouteProps) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id: conversationId } = await params;

  const account = await getWorkspaceInstagramAccount(
    workspaceId,
    request.nextUrl.searchParams.get("instagramAccountId")
  );
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Instagram account not connected." },
      { status: 400 }
    );
  }

  try {
    const accessToken = decryptToken(account.accessToken);
    const raw = await getConversationMessages(accessToken, conversationId);

    // The API returns newest-first; reverse to read top-to-bottom.
    const messages: ThreadMessage[] = raw
      .map((m) => ({
        id: m.id,
        text: m.message ?? "",
        fromMe: m.from?.id === account.instagramId,
        fromUsername: m.from?.username ?? null,
        createdTime: m.created_time ?? null,
        attachments: (m.attachments?.data ?? []).map(
          (a): ThreadAttachment => {
            const template = a.generic_template;
            if (template) {
              return {
                kind: "template",
                title: template.title?.trim() || null,
                subtitle: template.subtitle?.trim() || null,
                imageUrl: template.media_url ?? null,
                buttons: (template.cta ?? [])
                  .filter((c) => c.title)
                  .map((c) => ({ title: c.title!, url: c.url ?? null })),
              };
            }
            const image = a.image_data?.url ?? a.image_data?.preview_url ?? null;
            const video = a.video_data?.url ?? null;
            return {
              kind: image ? "image" : video ? "video" : "file",
              title: a.name?.trim() || null,
              subtitle: null,
              // A video still is more useful than a filename, so prefer it.
              imageUrl: image ?? a.video_data?.preview_url ?? null,
              buttons: [],
            };
          }
        ),
      }))
      .reverse();

    const data: ThreadResponse = { messages };
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[Conversation Messages] Error:", err);
    const message =
      err instanceof MetaApiError ? err.message : "Failed to load messages";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
