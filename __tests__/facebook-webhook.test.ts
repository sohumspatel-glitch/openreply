/**
 * Facebook Page webhook parsing.
 *
 * Payload shapes here follow Meta's Page webhook reference for the `feed`
 * field and the Messenger Platform's `messaging` array. The important
 * asymmetry the tests pin down: Instagram's `comments` field only ever means
 * "a new comment", while a Page's `feed` field means "something happened on
 * this Page" — a post, a like, a share, an edit, a deletion. Treating a feed
 * event as a comment without checking `item` and `verb` would re-fire a
 * campaign every time someone edited their comment.
 */

import { describe, it, expect } from "vitest";
import {
  parseCommentEvents,
  parseMessageEvents,
  parsePostbackEvents,
} from "@/lib/meta/webhook";
import { capabilitiesFor, platformForWebhookObject } from "@/lib/meta/platform";

const PAGE_ID = "page_100";
const POST_ID = "page_100_post_200";

function feedPayload(value: Record<string, unknown>) {
  return {
    object: "page",
    entry: [
      {
        id: PAGE_ID,
        time: 1_770_000_000,
        changes: [{ field: "feed", value }],
      },
    ],
  };
}

const NEW_COMMENT = {
  item: "comment",
  verb: "add",
  comment_id: "comment_300",
  post_id: POST_ID,
  parent_id: POST_ID,
  message: "INTEL",
  from: { id: "fb_user_400", name: "Ada Lovelace" },
  created_time: 1_770_000_000,
};

describe("platformForWebhookObject", () => {
  it("maps Meta's object names onto platforms", () => {
    expect(platformForWebhookObject("instagram")).toBe("INSTAGRAM");
    expect(platformForWebhookObject("page")).toBe("FACEBOOK");
  });

  it("returns null for anything else rather than guessing", () => {
    // Defaulting to Instagram here would file a stranger's events against a
    // connected account.
    expect(platformForWebhookObject("whatsapp_business_account")).toBeNull();
    expect(platformForWebhookObject(undefined)).toBeNull();
  });
});

describe("parseCommentEvents on a Facebook Page", () => {
  it("parses a new comment, mapping Page field names onto ours", () => {
    expect(parseCommentEvents(feedPayload(NEW_COMMENT))).toEqual([
      {
        platform: "FACEBOOK",
        instagramAccountId: PAGE_ID,
        commentId: "comment_300",
        commentText: "INTEL",
        commenterId: "fb_user_400",
        commenterName: "Ada Lovelace",
        mediaId: POST_ID,
        originalMediaId: undefined,
      },
    ]);
  });

  it("ignores an edited comment", () => {
    // The campaign has already replied to this comment. Meta allows exactly
    // one private reply per comment, so a second attempt is both a failure
    // and a wasted send.
    const events = parseCommentEvents(
      feedPayload({ ...NEW_COMMENT, verb: "edited" })
    );
    expect(events).toEqual([]);
  });

  it("ignores a deleted comment", () => {
    expect(
      parseCommentEvents(feedPayload({ ...NEW_COMMENT, verb: "remove" }))
    ).toEqual([]);
  });

  it("ignores feed activity that is not a comment", () => {
    for (const item of ["status", "post", "like", "share", "reaction"]) {
      expect(
        parseCommentEvents(feedPayload({ ...NEW_COMMENT, item }))
      ).toEqual([]);
    }
  });

  it("ignores the Page commenting on itself", () => {
    // Our own public reply arrives back on the same channel. Replying
    // privately to ourselves is rejected by Meta and would only produce a
    // failed log.
    expect(
      parseCommentEvents(
        feedPayload({ ...NEW_COMMENT, from: { id: PAGE_ID, name: "Startscalr" } })
      )
    ).toEqual([]);
  });

  it("ignores a comment with no post to attribute it to", () => {
    const { post_id: _dropped, ...noPost } = NEW_COMMENT;
    expect(parseCommentEvents(feedPayload(noPost))).toEqual([]);
  });

  it("does not read a Page payload through Instagram's field name", () => {
    // `comments` is Instagram's channel. A Page that somehow sent it should
    // not be parsed as though the Instagram shape applied.
    const payload = {
      object: "page",
      entry: [
        {
          id: PAGE_ID,
          time: 1,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_300",
                text: "INTEL",
                from: { id: "fb_user_400", username: "ada" },
                media: { id: "media_1" },
              },
            },
          ],
        },
      ],
    };
    expect(parseCommentEvents(payload)).toEqual([]);
  });

  it("still parses Instagram comments unchanged", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "ig_900",
          time: 1,
          changes: [
            {
              field: "comments",
              value: {
                id: "c_1",
                text: "INTEL",
                from: { id: "igsid_2", username: "ada" },
                media: { id: "media_3" },
              },
            },
          ],
        },
      ],
    };
    expect(parseCommentEvents(payload)).toEqual([
      {
        platform: "INSTAGRAM",
        instagramAccountId: "ig_900",
        commentId: "c_1",
        commentText: "INTEL",
        commenterId: "igsid_2",
        commenterName: "ada",
        mediaId: "media_3",
        originalMediaId: undefined,
      },
    ]);
  });
});

describe("messaging events on a Facebook Page", () => {
  it("parses an inbound Page message", () => {
    // `entry[].messaging[]` is byte-identical between the two platforms,
    // which is why the campaign engine is shared rather than forked.
    expect(
      parseMessageEvents({
        object: "page",
        entry: [
          {
            id: PAGE_ID,
            time: 1,
            messaging: [
              {
                sender: { id: "fb_user_400" },
                recipient: { id: PAGE_ID },
                message: { mid: "mid_1", text: "INTEL" },
              },
            ],
          },
        ],
      })
    ).toEqual([
      {
        platform: "FACEBOOK",
        instagramAccountId: PAGE_ID,
        messageId: "mid_1",
        messageText: "INTEL",
        senderId: "fb_user_400",
      },
    ]);
  });

  it("drops the Page's own echoes", () => {
    expect(
      parseMessageEvents({
        object: "page",
        entry: [
          {
            id: PAGE_ID,
            time: 1,
            messaging: [
              {
                sender: { id: PAGE_ID },
                message: { mid: "mid_2", text: "INTEL", is_echo: true },
              },
            ],
          },
        ],
      })
    ).toEqual([]);
  });

  it("parses a button tap on a Page", () => {
    expect(
      parsePostbackEvents({
        object: "page",
        entry: [
          {
            id: PAGE_ID,
            time: 1,
            messaging: [
              {
                sender: { id: "fb_user_400" },
                recipient: { id: PAGE_ID },
                postback: { mid: "mid_3", title: "Send it", payload: "DM_1" },
              },
            ],
          },
        ],
      })
    ).toEqual([
      {
        platform: "FACEBOOK",
        instagramAccountId: PAGE_ID,
        userId: "fb_user_400",
        payload: "DM_1",
        mid: "mid_3",
      },
    ]);
  });
});

describe("capabilitiesFor", () => {
  it("points each platform at its own Graph host", () => {
    expect(capabilitiesFor("INSTAGRAM").graphBase).toContain(
      "graph.instagram.com"
    );
    expect(capabilitiesFor("FACEBOOK").graphBase).toContain(
      "graph.facebook.com"
    );
  });

  it("records that a Page cannot report follow status", () => {
    // The Messenger user profile API exposes id, name, first_name, last_name,
    // profile_pic, locale, timezone and gender — and nothing resembling
    // Instagram's is_user_follow_business. A follow-gated campaign therefore
    // cannot be honoured on a Page, and the builder has to say so rather than
    // silently letting everyone through.
    expect(capabilitiesFor("INSTAGRAM").canCheckFollowStatus).toBe(true);
    expect(capabilitiesFor("FACEBOOK").canCheckFollowStatus).toBe(false);
  });

  it("subscribes each platform to its own comment channel", () => {
    expect(capabilitiesFor("INSTAGRAM").subscribedFields).toContain("comments");
    expect(capabilitiesFor("FACEBOOK").subscribedFields).toContain("feed");
  });

  it("agrees that a private reply is good for seven days on both", () => {
    expect(capabilitiesFor("INSTAGRAM").privateReplyWindowDays).toBe(7);
    expect(capabilitiesFor("FACEBOOK").privateReplyWindowDays).toBe(7);
  });
});
