import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendDirectMessageWithCard } from "../lib/meta/client";

// The outbound guard sits in front of every send and fails closed, so a test
// that exercises a send needs a Redis it can talk to. This mock is permissive
// by design: these files test message shape, not the guard. The guard's own
// behaviour is covered in __tests__/outbound-guard.test.ts.
vi.mock("@/lib/meta/outbound-guard", () => ({
  claimOutboundSend: vi.fn(async () => undefined),
  releaseOutboundClaim: vi.fn(async () => undefined),
  outboundCountFor: vi.fn(async () => 0),
  OutboundBlockedError: class OutboundBlockedError extends Error {},
  OUTBOUND_LIMITS: { MAX_PER_DESTINATION: 3, DUPLICATE_TTL_SEC: 604800 },
}));


/**
 * The follow-up card is Meta's `generic` template, not the `button` template
 * used elsewhere. Getting the payload shape wrong fails the whole send, so
 * these lock the parts Meta is strict about: the template type, the single
 * element, the length caps, and dropping optional fields rather than sending
 * them empty.
 */
function mockFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ recipient_id: "user_1", message_id: "mid_1" }),
    text: async () => "",
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function bodyOf(fetchMock: ReturnType<typeof mockFetch>) {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubEnv("META_GRAPH_API_VERSION", "v25.0");
});

describe("follow-up link card", () => {
  it("sends a generic template with one element and one web_url button", async () => {
    const fetchMock = mockFetch();

    await sendDirectMessageWithCard("token", "ig_1", "user_1", {
      title: "Hey! I wanna give you a FREE GIFT.",
      subtitle: "CLAIM YOUR FREE GIFT BELOW",
      imageUrl: "https://example.com/gift.png",
      buttonTitle: "FREE GIFT!",
      buttonUrl: "https://example.com/r/abc",
    });

    const payload = bodyOf(fetchMock).message.attachment.payload;
    expect(payload.template_type).toBe("generic");
    expect(payload.elements).toHaveLength(1);

    const element = payload.elements[0];
    expect(element.title).toBe("Hey! I wanna give you a FREE GIFT.");
    expect(element.subtitle).toBe("CLAIM YOUR FREE GIFT BELOW");
    expect(element.image_url).toBe("https://example.com/gift.png");
    expect(element.buttons).toEqual([
      {
        type: "web_url",
        url: "https://example.com/r/abc",
        title: "FREE GIFT!",
      },
    ]);
    // Tapping the card body should reach the same destination as the button.
    expect(element.default_action).toEqual({
      type: "web_url",
      url: "https://example.com/r/abc",
    });
  });

  it("omits image and subtitle rather than sending them empty", async () => {
    const fetchMock = mockFetch();

    await sendDirectMessageWithCard("token", "ig_1", "user_1", {
      title: "Just a headline",
      subtitle: "   ",
      imageUrl: null,
      buttonTitle: "Open",
      buttonUrl: "https://example.com/r/abc",
    });

    const element = bodyOf(fetchMock).message.attachment.payload.elements[0];
    expect(element).not.toHaveProperty("image_url");
    expect(element).not.toHaveProperty("subtitle");
  });

  it("asks for a square image only when told to", async () => {
    const fetchMock = mockFetch();

    await sendDirectMessageWithCard("token", "ig_1", "user_1", {
      title: "Square creative",
      buttonTitle: "Open",
      buttonUrl: "https://example.com/r/abc",
      imageUrl: "https://example.com/square.png",
      imageAspect: "square",
    });

    const payload = bodyOf(fetchMock).message.attachment.payload;
    expect(payload.image_aspect_ratio).toBe("square");
  });

  it("leaves the aspect ratio to Meta's default otherwise", async () => {
    const fetchMock = mockFetch();

    await sendDirectMessageWithCard("token", "ig_1", "user_1", {
      title: "Wide creative",
      buttonTitle: "Open",
      buttonUrl: "https://example.com/r/abc",
      imageUrl: "https://example.com/wide.png",
      imageAspect: "horizontal",
    });

    const payload = bodyOf(fetchMock).message.attachment.payload;
    expect(payload).not.toHaveProperty("image_aspect_ratio");
  });

  it("truncates to Meta's limits instead of letting the send fail", async () => {
    const fetchMock = mockFetch();

    await sendDirectMessageWithCard("token", "ig_1", "user_1", {
      title: "T".repeat(120),
      subtitle: "S".repeat(120),
      imageUrl: null,
      buttonTitle: "B".repeat(40),
      buttonUrl: "https://example.com/r/abc",
    });

    const element = bodyOf(fetchMock).message.attachment.payload.elements[0];
    expect(element.title).toHaveLength(80);
    expect(element.subtitle).toHaveLength(80);
    expect(element.buttons[0].title).toHaveLength(20);
  });
});
