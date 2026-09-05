/**
 * Comment reconciliation — ad copies of a boosted post.
 *
 * Comments left on an ad carry the ad's own media id, so the sweep has to look
 * at those media too or a webhook Meta never delivers is lost for good.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { $queryRaw: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));

import { adMediaFor, shouldAct } from "../lib/polling/comment-reconciler";

const POST = "18023946917554990";
const AD = "17899788633163100";

describe("adMediaFor", () => {
  beforeEach(() => {
    mockPrisma.$queryRaw.mockReset();
  });

  it("returns the ad media ids seen for the post", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ mediaId: AD }]);
    await expect(adMediaFor(POST)).resolves.toEqual([AD]);
  });

  it("never returns the post itself, so it is not swept twice", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ mediaId: AD }, { mediaId: POST }]);
    await expect(adMediaFor(POST)).resolves.toEqual([AD]);
  });

  it("drops rows without a media id", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ mediaId: null }, { mediaId: AD }]);
    await expect(adMediaFor(POST)).resolves.toEqual([AD]);
  });

  it("returns nothing when the post was never boosted", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await expect(adMediaFor(POST)).resolves.toEqual([]);
  });

  it("swallows a query failure, leaving the post itself still swept", async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error("connection lost"));
    await expect(adMediaFor(POST)).resolves.toEqual([]);
  });
});

describe("shouldAct — a failed DM is not 'handled'", () => {
  const sent = { status: "SENT", publicReplySentAt: new Date(), attempts: 1 };
  const dmFailed = { status: "FAILED", publicReplySentAt: new Date(), attempts: 1 };

  it("retries when the public reply posted but the DM did not", () => {
    // The exact regression: the reply is posted BEFORE the DM, so treating it
    // as completion marked every failed DM as done forever.
    expect(
      shouldAct({ ownerReplied: true, publicReplyEnabled: true, log: dmFailed })
    ).toBe(true);
  });

  it("stops once the attempt cap is reached", () => {
    expect(
      shouldAct({
        ownerReplied: true,
        publicReplyEnabled: true,
        log: { ...dmFailed, attempts: 5 },
        maxAttempts: 5,
      })
    ).toBe(false);
  });

  it("leaves a fully delivered comment alone", () => {
    expect(
      shouldAct({ ownerReplied: true, publicReplyEnabled: true, log: sent })
    ).toBe(false);
  });

  it("still retries the public reply when the DM sent but the reply did not", () => {
    expect(
      shouldAct({
        ownerReplied: false,
        publicReplyEnabled: true,
        log: { ...sent, publicReplySentAt: null },
      })
    ).toBe(true);
  });

  it("does not touch a comment a human answered by hand", () => {
    expect(
      shouldAct({ ownerReplied: true, publicReplyEnabled: true, log: undefined })
    ).toBe(false);
  });

  it("acts on a fresh unanswered comment", () => {
    expect(
      shouldAct({ ownerReplied: false, publicReplyEnabled: true, log: undefined })
    ).toBe(true);
  });

  it("counts a SENT DM as done when the campaign posts no public reply", () => {
    expect(
      shouldAct({
        ownerReplied: false,
        publicReplyEnabled: false,
        log: { ...sent, publicReplySentAt: null },
      })
    ).toBe(false);
  });
});
