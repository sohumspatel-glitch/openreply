import type { SocialPlatform } from "@/app/generated/prisma/client";
import { getMetaGraphApiVersion } from "@/lib/env";

/**
 * The only place a Facebook/Instagram difference is allowed to live.
 *
 * The two surfaces are far more alike than they look. Both send through
 * `POST /{account-id}/messages`. Both accept `recipient: {comment_id}` to
 * privately reply to a commenter, allow exactly one such reply per comment,
 * and allow it for seven days. Both deliver webhooks as `entry[].messaging[]`
 * in an identical shape. So the campaign engine, the queue, the outbound
 * guard, and the logs are shared wholesale, and only what genuinely differs
 * is described here.
 *
 * What genuinely differs, verified against Meta's docs rather than assumed:
 *
 *   - Host. Instagram-Login accounts talk to graph.instagram.com; Pages talk
 *     to graph.facebook.com.
 *   - Comment webhooks. Instagram sends `changes[].field === "comments"` with
 *     `value.text` and `value.from.username`. A Page sends
 *     `changes[].field === "feed"` with `value.item === "comment"`,
 *     `value.message`, and `value.from.name` -- different field names for the
 *     same information, plus edits and deletes on the same channel that have
 *     to be filtered out.
 *   - Follow gating. Instagram exposes `is_user_follow_business` on the
 *     recipient. The Messenger user profile API has no equivalent field at
 *     all, so a campaign cannot require a Page follow. This is a real
 *     capability loss, not an omission.
 *   - The messaging window. Both allow seven days for a private reply to a
 *     comment. But a Page's *follow-up* messages fall under the 24 hour
 *     standard messaging window, and the three tags that used to buy more
 *     time (CONFIRMED_EVENT_UPDATE, ACCOUNT_UPDATE, POST_PURCHASE_UPDATE)
 *     started returning error 100 on 2026-04-27. HUMAN_AGENT still buys seven
 *     days but needs the Human Agent feature approved.
 */

export interface PlatformCapabilities {
  /** Host for Graph calls, version included. */
  graphBase: string;
  /** `object` value on an incoming webhook payload. */
  webhookObject: "instagram" | "page";
  /** `changes[].field` carrying new comments. */
  commentField: "comments" | "feed";
  /** Fields to subscribe when connecting an account. */
  subscribedFields: string[];
  /**
   * Whether the recipient's follow status can be read. Instagram exposes
   * `is_user_follow_business`; Messenger exposes no such field, so a
   * follow-gated campaign cannot be honoured on a Page.
   */
  canCheckFollowStatus: boolean;
  /**
   * Hours a normal (non private-reply) message may be sent after the user's
   * last message. Exceeding it fails at send time, so a delayed follow-up has
   * to be checked against this before it is scheduled.
   */
  standardWindowHours: number;
  /** Days a private reply to a comment stays permitted. */
  privateReplyWindowDays: number;
  /** Human-readable name, for UI and log messages. */
  label: string;
}

const INSTAGRAM: PlatformCapabilities = {
  graphBase: "",
  webhookObject: "instagram",
  commentField: "comments",
  subscribedFields: ["comments", "messages", "messaging_postbacks"],
  canCheckFollowStatus: true,
  standardWindowHours: 24,
  privateReplyWindowDays: 7,
  label: "Instagram",
};

const FACEBOOK: PlatformCapabilities = {
  graphBase: "",
  webhookObject: "page",
  commentField: "feed",
  // `feed` is the only channel that carries Page comments; it also carries
  // posts, likes, and edits, which parseCommentEvents filters out.
  subscribedFields: ["feed", "messages", "messaging_postbacks"],
  canCheckFollowStatus: false,
  standardWindowHours: 24,
  privateReplyWindowDays: 7,
  label: "Facebook",
};

/**
 * Resolved per call rather than at module load: getMetaGraphApiVersion reads
 * the environment, and pinning it into a constant at import time makes the
 * version untestable and freezes whatever was set when the module first
 * loaded.
 */
export function capabilitiesFor(
  platform: SocialPlatform
): PlatformCapabilities {
  const version = getMetaGraphApiVersion();
  const base = platform === "FACEBOOK" ? FACEBOOK : INSTAGRAM;

  return {
    ...base,
    graphBase:
      platform === "FACEBOOK"
        ? `https://graph.facebook.com/${version}`
        : `https://graph.instagram.com/${version}`,
  };
}

export function graphBaseFor(platform: SocialPlatform): string {
  return capabilitiesFor(platform).graphBase;
}

/**
 * Which platform a webhook payload belongs to, or null if it is neither.
 * Returning null rather than defaulting to Instagram matters: an unrecognised
 * payload silently parsed as Instagram would attribute a stranger's events to
 * a connected account.
 */
export function platformForWebhookObject(
  object: string | undefined
): SocialPlatform | null {
  if (object === "instagram") return "INSTAGRAM";
  if (object === "page") return "FACEBOOK";
  return null;
}
