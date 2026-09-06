import { createHmac, timingSafeEqual } from "crypto";
import type { SocialPlatform } from "@/app/generated/prisma/client";
import { capabilitiesFor, platformForWebhookObject } from "@/lib/meta/platform";

export function verifyWebhookSignature(
  payload: string,
  signature: string | null
): boolean {
  if (!signature) return false;

  // Instagram-Login apps sign webhooks with the Instagram app secret, while
  // Facebook-Login apps use the Facebook app secret. Both belong to the same
  // app, so accept a signature that matches either — this avoids a config
  // guess about which key Meta uses for a given app type.
  const secrets = [
    process.env.FACEBOOK_APP_SECRET,
    process.env.INSTAGRAM_APP_SECRET,
  ].filter((s): s is string => Boolean(s));

  if (secrets.length === 0) {
    throw new Error(
      "FACEBOOK_APP_SECRET or INSTAGRAM_APP_SECRET is required to verify webhooks"
    );
  }

  return secrets.some((secret) => {
    const expected =
      "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

export interface WebhookCommentEvent {
  platform: SocialPlatform;
  instagramAccountId: string;
  commentId: string;
  commentText: string;
  commenterId: string;
  commenterName?: string;
  mediaId: string;
  /**
   * Set only when the comment was left on an ad: the id of the organic post
   * the ad was created from. Campaigns are configured against that post, so
   * matching has to consider it as well as mediaId.
   */
  originalMediaId?: string;
}

interface WebhookEntry {
  id: string;
  time: number;
  changes?: Array<{
    field: string;
    value: {
      id?: string;
      comment_id?: string;
      text?: string;
      // A Page's `feed` channel names the same things differently: the body
      // is `message` rather than `text`, the commenter has a `name` rather
      // than a `username`, and the post is `post_id` rather than `media`.
      // `item` and `verb` say what kind of activity this is at all.
      item?: string;
      verb?: string;
      message?: string;
      post_id?: string;
      parent_id?: string;
      from?: {
        id?: string;
        username?: string;
        name?: string;
      };
      media?: {
        id?: string;
        // Present when media_product_type is "AD": the ad copy gets its own
        // media id, and this points back to the post it was boosted from.
        original_media_id?: string;
        ad_id?: string;
        media_product_type?: string;
      };
      media_id?: string;
    };
  }>;
  messaging?: Array<{
    sender?: { id?: string };
    recipient?: { id?: string };
    postback?: { mid?: string; title?: string; payload?: string };
    read?: { watermark?: number; seq?: number };
    message?: {
      mid?: string;
      text?: string;
      is_echo?: boolean;
      is_deleted?: boolean;
      is_unsupported?: boolean;
      attachments?: Array<{ type?: string }>;
    };
  }>;
}

export interface WebhookMessageEvent {
  platform: SocialPlatform;
  instagramAccountId: string;
  messageId: string;
  messageText: string;
  senderId: string;
}

export interface WebhookPostbackEvent {
  platform: SocialPlatform;
  instagramAccountId: string;
  userId: string;
  payload: string;
  mid?: string;
}

export interface WebhookReadEvent {
  platform: SocialPlatform;
  instagramAccountId: string;
  userId: string;
  watermark?: number;
}

interface WebhookPayload {
  object: string;
  entry: WebhookEntry[];
}

export function parseCommentEvents(payload: WebhookPayload): WebhookCommentEvent[] {
  const events: WebhookCommentEvent[] = [];

  const platform = platformForWebhookObject(payload.object);
  if (!platform) return events;

  const { commentField } = capabilitiesFor(platform);
  const isPage = platform === "FACEBOOK";

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== commentField) continue;

      const value = change.value;

      // Instagram's `comments` field only ever carries a new comment. A
      // Page's `feed` carries everything that happens on the Page -- posts,
      // likes, shares, edits, deletions -- so the comment additions have to
      // be picked out of it. Without the `verb` check an edited comment would
      // re-trigger a campaign that already replied to it, and a deletion
      // would trigger one that never did.
      if (isPage) {
        if (value?.item !== "comment") continue;
        if (value?.verb && value.verb !== "add") continue;
      }

      const commentId = isPage
        ? value?.comment_id
        : (value?.id ?? value?.comment_id);
      const mediaId = isPage
        ? value?.post_id
        : (value?.media?.id ?? value?.media_id);
      // A comment on a boosted post arrives with the ad's media id, while the
      // campaign is set up against the organic post. Keep both so the worker
      // can match either one.
      // Boosted-post rewriting is Instagram-only: a Page ad comment arrives
      // under the Page post's own id, so there is nothing to map back.
      const originalMediaId = isPage
        ? undefined
        : value?.media?.original_media_id === mediaId
          ? undefined
          : value?.media?.original_media_id;
      const commenterId = value?.from?.id;

      if (!entry.id || !commentId || !mediaId || !commenterId) {
        continue;
      }

      // Skip the connected account's own comments and comment replies.
      // A private reply to yourself is rejected by Meta, so queueing one
      // only produces a failed log and wasted retries.
      if (commenterId === entry.id) {
        continue;
      }

      events.push({
        platform,
        instagramAccountId: entry.id,
        commentId,
        // Instagram calls the body `text`, a Page calls it `message`.
        commentText: value.text ?? value.message ?? "",
        commenterId,
        // Instagram has a handle; a Facebook commenter has only a display
        // name. Both are shown to the operator, neither is addressed to.
        commenterName: value.from?.username ?? value.from?.name,
        mediaId,
        originalMediaId,
      });
    }
  }

  return events;
}

/**
 * Parse button-tap postbacks (from an opening DM's button) out of a webhook
 * payload. Each event carries the tapping user's IGSID and our postback payload.
 */
export function parsePostbackEvents(
  payload: WebhookPayload
): WebhookPostbackEvent[] {
  const events: WebhookPostbackEvent[] = [];

  const platform = platformForWebhookObject(payload.object);
  if (!platform) return events;

  for (const entry of payload.entry ?? []) {
    for (const messaging of entry.messaging ?? []) {
      const postbackPayload = messaging.postback?.payload;
      const userId = messaging.sender?.id;
      const accountId = entry.id ?? messaging.recipient?.id;

      if (!postbackPayload || !userId || !accountId) continue;
      // Ignore echoes of the account's own actions.
      if (userId === accountId) continue;

      events.push({
        platform,
        instagramAccountId: accountId,
        userId,
        payload: postbackPayload,
        mid: messaging.postback?.mid,
      });
    }
  }

  return events;
}

/**
 * Parse inbound Instagram DMs out of a webhook payload. These drive the
 * keyword-triggered autoreply: a user messages the account, and a campaign
 * with `dmTriggerEnabled` whose keywords match the text replies to them.
 *
 * Echoes (messages the account itself sent, including our own autoreplies),
 * deletions, and attachment-only messages with no text are dropped here so
 * the worker never sees them — an echo would otherwise let an autoreply
 * containing its own keyword trigger itself.
 */
export function parseMessageEvents(
  payload: WebhookPayload
): WebhookMessageEvent[] {
  const events: WebhookMessageEvent[] = [];

  const platform = platformForWebhookObject(payload.object);
  if (!platform) return events;

  for (const entry of payload.entry ?? []) {
    for (const messaging of entry.messaging ?? []) {
      const message = messaging.message;
      if (!message) continue;
      if (message.is_echo || message.is_deleted || message.is_unsupported) {
        continue;
      }

      const text = message.text?.trim();
      const messageId = message.mid;
      const senderId = messaging.sender?.id;
      const accountId = entry.id ?? messaging.recipient?.id;

      if (!text || !messageId || !senderId || !accountId) continue;
      // Ignore anything the connected account sent to itself.
      if (senderId === accountId) continue;

      events.push({
        platform,
        instagramAccountId: accountId,
        messageId,
        messageText: text,
        senderId,
      });
    }
  }

  return events;
}

/**
 * Parse Instagram DM read receipts. When a user reads an opening DM but does
 * not tap its button, the webhook route uses this to schedule the reveal after
 * a short grace period.
 */
export function parseReadEvents(payload: WebhookPayload): WebhookReadEvent[] {
  const events: WebhookReadEvent[] = [];

  const platform = platformForWebhookObject(payload.object);
  if (!platform) return events;

  for (const entry of payload.entry ?? []) {
    for (const messaging of entry.messaging ?? []) {
      if (!messaging.read) continue;

      const userId = messaging.sender?.id;
      const accountId = entry.id ?? messaging.recipient?.id;

      if (!userId || !accountId) continue;
      if (userId === accountId) continue;

      events.push({
        platform,
        instagramAccountId: accountId,
        userId,
        watermark: messaging.read.watermark,
      });
    }
  }

  return events;
}
