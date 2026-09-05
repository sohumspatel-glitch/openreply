/**
 * Outbound guard — the regression suite for 2026-09-05.
 *
 * On that day two people were each sent the same DM thirteen times. Four
 * separate defects lined up, but every one of them ended the same way: a send
 * function was called again with content it had already delivered. So the test
 * that matters is not "does the retry logic count correctly" — it is "can the
 * same message physically leave twice". It cannot, and these tests are what
 * hold that.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { store, mockSet, mockIncr, mockDecr, mockExpire, mockDel, mockGet } =
  vi.hoisted(() => {
    const store = new Map<string, string>();
    return {
      store,
      mockSet: vi.fn(
        async (key: string, value: string, _ex: string, _ttl: number, nx?: string) => {
          if (nx === "NX" && store.has(key)) return null;
          store.set(key, value);
          return "OK";
        }
      ),
      mockIncr: vi.fn(async (key: string) => {
        const next = Number(store.get(key) ?? 0) + 1;
        store.set(key, String(next));
        return next;
      }),
      mockDecr: vi.fn(async (key: string) => {
        const next = Number(store.get(key) ?? 0) - 1;
        store.set(key, String(next));
        return next;
      }),
      mockExpire: vi.fn(async () => 1),
      mockDel: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
      mockGet: vi.fn(async (key: string) => store.get(key) ?? null),
    };
  });

vi.mock("ioredis", () => {
  const MockRedis = vi.fn().mockImplementation(function (
    this: Record<string, unknown>
  ) {
    this.set = mockSet;
    this.incr = mockIncr;
    this.decr = mockDecr;
    this.expire = mockExpire;
    this.del = mockDel;
    this.get = mockGet;
    return this;
  });
  return { default: MockRedis };
});

vi.stubEnv("REDIS_URL", "redis://localhost:6379");

import {
  claimOutboundSend,
  releaseOutboundClaim,
  outboundCountFor,
  OutboundBlockedError,
  OUTBOUND_LIMITS,
} from "@/lib/meta/outbound-guard";

const ACCOUNT = "17841400000000000";
const COMMENT = "comment:18202527874370248";
const BODY = { text: "here is the link to the guide about X. ENJOY! https://…" };

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe("exact-duplicate lock", () => {
  it("allows the first send", async () => {
    await expect(
      claimOutboundSend(ACCOUNT, COMMENT, BODY)
    ).resolves.toBeUndefined();
  });

  it("refuses the identical message to the same destination", async () => {
    await claimOutboundSend(ACCOUNT, COMMENT, BODY);
    await expect(claimOutboundSend(ACCOUNT, COMMENT, BODY)).rejects.toThrow(
      OutboundBlockedError
    );
  });

  it("is what would have stopped the incident: 13 attempts, 1 delivery", async () => {
    let delivered = 0;
    for (let i = 0; i < 13; i++) {
      try {
        await claimOutboundSend(ACCOUNT, COMMENT, BODY);
        delivered += 1;
      } catch (error) {
        expect(error).toBeInstanceOf(OutboundBlockedError);
      }
    }
    expect(delivered).toBe(1);
  });

  it("does not charge the destination cap for a refused duplicate", async () => {
    await claimOutboundSend(ACCOUNT, COMMENT, BODY);
    for (let i = 0; i < 5; i++) {
      await claimOutboundSend(ACCOUNT, COMMENT, BODY).catch(() => undefined);
    }
    // One real send, so one against the daily allowance — not six.
    expect(await outboundCountFor(ACCOUNT, COMMENT)).toBe(1);
  });

  it("treats different content to the same destination as a different message", async () => {
    await claimOutboundSend(ACCOUNT, COMMENT, BODY);
    await expect(
      claimOutboundSend(ACCOUNT, COMMENT, { text: "one more thing…" })
    ).resolves.toBeUndefined();
  });

  it("treats the same content to a different destination as a different message", async () => {
    await claimOutboundSend(ACCOUNT, COMMENT, BODY);
    await expect(
      claimOutboundSend(ACCOUNT, "comment:999", BODY)
    ).resolves.toBeUndefined();
  });
});

describe("destination volume cap", () => {
  it("stops at the cap however varied the content is", async () => {
    let delivered = 0;
    for (let i = 0; i < 10; i++) {
      try {
        await claimOutboundSend(ACCOUNT, COMMENT, { text: `message ${i}` });
        delivered += 1;
      } catch (error) {
        expect(error).toBeInstanceOf(OutboundBlockedError);
      }
    }
    expect(delivered).toBe(OUTBOUND_LIMITS.MAX_PER_DESTINATION);
  });

  it("reports destination_cap rather than duplicate once over the line", async () => {
    for (let i = 0; i < OUTBOUND_LIMITS.MAX_PER_DESTINATION; i++) {
      await claimOutboundSend(ACCOUNT, COMMENT, { text: `m${i}` });
    }
    await expect(
      claimOutboundSend(ACCOUNT, COMMENT, { text: "one too many" })
    ).rejects.toMatchObject({ reason: "destination_cap" });
  });
});

describe("fail closed", () => {
  it("refuses to send when Redis is unreachable", async () => {
    mockSet.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(claimOutboundSend(ACCOUNT, COMMENT, BODY)).rejects.toMatchObject(
      { reason: "guard_unavailable" }
    );
  });
});

describe("releasing a claim", () => {
  it("lets content be re-sent after a failure that proves non-delivery", async () => {
    await claimOutboundSend(ACCOUNT, COMMENT, BODY);
    await releaseOutboundClaim(ACCOUNT, COMMENT, BODY);
    await expect(
      claimOutboundSend(ACCOUNT, COMMENT, BODY)
    ).resolves.toBeUndefined();
  });

  it("returns the destination allowance too, so a released send is free", async () => {
    await claimOutboundSend(ACCOUNT, COMMENT, BODY);
    await releaseOutboundClaim(ACCOUNT, COMMENT, BODY);
    expect(await outboundCountFor(ACCOUNT, COMMENT)).toBe(0);
  });
});
