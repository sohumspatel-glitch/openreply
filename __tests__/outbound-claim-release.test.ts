/**
 * Which failures release an outbound claim.
 *
 * This is the pair of regressions in one file, and they pull in opposite
 * directions, which is exactly why both need holding down:
 *
 *   - Release too little and a person who hit one ordinary refusal is locked
 *     out of the campaign and never gets their DM. Twenty-three people on
 *     2026-09-05.
 *   - Release too much and a send Meta reported as failed but actually
 *     delivered goes out again. Two people, thirteen times each, the same day.
 *
 * The line between them is whether Meta told us why. A described refusal means
 * nothing was delivered. Code 1 means Meta does not know, and neither do we.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockClaim, mockRelease } = vi.hoisted(() => ({
  mockClaim: vi.fn(async () => undefined),
  mockRelease: vi.fn(async () => undefined),
}));

vi.mock("@/lib/meta/outbound-guard", () => ({
  claimOutboundSend: mockClaim,
  releaseOutboundClaim: mockRelease,
  outboundCountFor: vi.fn(async () => 0),
  OutboundBlockedError: class OutboundBlockedError extends Error {},
  OUTBOUND_LIMITS: { MAX_PER_DESTINATION: 3, DUPLICATE_TTL_SEC: 21600 },
}));

vi.stubEnv("META_GRAPH_API_VERSION", "v25.0");

import { sendPrivateReply } from "@/lib/meta/client";

const TOKEN = "tok";
const ACCOUNT = "17841442401815705";
const COMMENT = "18078650354510650";

/** A Meta error envelope, as the Graph API actually returns one. */
function metaError(code: number, message: string, status = 400) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { code, message, fbtrace_id: "trace" } }),
    text: async () => JSON.stringify({ error: { code, message } }),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a described refusal releases the claim", () => {
  // Every one of these means the message did not go out, so the same content
  // must remain sendable — otherwise one bad minute costs the recipient the
  // whole campaign.
  const described: [number, string][] = [
    [100, "The thread owner has archived or deleted this conversation, or the thread does not exist."],
    [100, "Please check if access token has enough IG permissions granular scopes for IG private reply."],
    [10, "This message is sent outside of allowed window."],
    [200, "Insufficient permission to post a private reply"],
    [4, "Application request limit reached"],
    [190, "Error validating access token: Session has expired"],
  ];

  for (const [code, message] of described) {
    it(`releases on code ${code}: ${message.slice(0, 46)}…`, async () => {
      vi.stubGlobal("fetch", vi.fn(async () => metaError(code, message)));
      await expect(
        sendPrivateReply(TOKEN, ACCOUNT, COMMENT, "here is your link")
      ).rejects.toThrow();
      expect(mockClaim).toHaveBeenCalledTimes(1);
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });
  }
});

describe("an unknown outcome keeps the claim", () => {
  it("holds on code 1, which Meta returns on sends that did deliver", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => metaError(1, "An unknown error has occurred."))
    );
    await expect(
      sendPrivateReply(TOKEN, ACCOUNT, COMMENT, "here is your link")
    ).rejects.toThrow();
    expect(mockClaim).toHaveBeenCalledTimes(1);
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("holds when the request never reached Meta at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("socket hang up");
      })
    );
    await expect(
      sendPrivateReply(TOKEN, ACCOUNT, COMMENT, "here is your link")
    ).rejects.toThrow("socket hang up");
    expect(mockClaim).toHaveBeenCalledTimes(1);
    expect(mockRelease).not.toHaveBeenCalled();
  });
});

describe("a successful send", () => {
  it("claims once and never releases", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ recipient_id: "123", message_id: "m1" }),
        text: async () => "{}",
      }) as unknown as Response)
    );
    await expect(
      sendPrivateReply(TOKEN, ACCOUNT, COMMENT, "here is your link")
    ).resolves.toMatchObject({ message_id: "m1" });
    expect(mockClaim).toHaveBeenCalledTimes(1);
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("claims against the comment, not the account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ recipient_id: "123", message_id: "m1" }),
        text: async () => "{}",
      }) as unknown as Response)
    );
    await sendPrivateReply(TOKEN, ACCOUNT, COMMENT, "here is your link");
    expect(mockClaim).toHaveBeenCalledWith(
      ACCOUNT,
      `comment:${COMMENT}`,
      expect.anything()
    );
  });
});
