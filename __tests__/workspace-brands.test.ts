import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    workspaceMember: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));

import { brandKeyForWorkspaceName, getBrandForWorkspaceName } from "../lib/branding";
import { assertCampaignAccount, selectBrandAccount } from "../lib/brand-accounts";
import {
  GUIDE_CAMPAIGN_PROFILES,
  buildGuideAutomationData,
  resolveGuideBrand,
  validateGuideSpec,
  type GuideCampaignSpec,
} from "../lib/guide-campaign-brands";
import { getWorkspaceMembership, normalizeWorkspaceName } from "../lib/workspace";
import { isPlausibleWorkspaceId } from "../lib/active-workspace";

beforeEach(() => vi.clearAllMocks());

describe("branding", () => {
  it("maps a workspace named Settr, in any case, to the Settr brand", () => {
    expect(brandKeyForWorkspaceName("Settr")).toBe("settr");
    expect(brandKeyForWorkspaceName("  settr ")).toBe("settr");
    expect(brandKeyForWorkspaceName("SETTR")).toBe("settr");
    expect(getBrandForWorkspaceName("Settr").iconSrc).toBe("/brands/settr.png");
  });

  it("keeps every other workspace on the Startscalr look", () => {
    for (const name of [
      "Startscalr",
      "patel.gpt18's workspace",
      "Settr Labs",
      "",
      null,
      undefined,
    ]) {
      const brand = getBrandForWorkspaceName(name);
      expect(brand.key).toBe("startscalr");
      expect(brand.name).toBe("Startscalr");
      expect(brand.iconSrc).toBeNull();
      expect(brand.accent).toBeNull();
    }
  });
});

describe("active workspace", () => {
  it("honours the preferred workspace when the user is a member", async () => {
    const workspace = { id: "ws_settr", name: "Settr" };
    mockPrisma.workspaceMember.findUnique.mockResolvedValue({
      workspace,
      role: "OWNER",
    });

    await expect(getWorkspaceMembership("user_1", "ws_settr")).resolves.toEqual({
      workspace,
      role: "OWNER",
    });
    expect(mockPrisma.workspaceMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_userId: { workspaceId: "ws_settr", userId: "user_1" },
        },
      })
    );
    expect(mockPrisma.workspaceMember.findFirst).not.toHaveBeenCalled();
  });

  it("falls back to the oldest membership for a workspace the user is not in", async () => {
    const workspace = { id: "ws_startscalr", name: "Startscalr" };
    mockPrisma.workspaceMember.findUnique.mockResolvedValue(null);
    mockPrisma.workspaceMember.findFirst.mockResolvedValue({
      workspace,
      role: "OWNER",
    });

    await expect(
      getWorkspaceMembership("user_1", "ws_someone_else")
    ).resolves.toEqual({ workspace, role: "OWNER" });
  });

  it("does exactly the old lookup when there is no preference", async () => {
    mockPrisma.workspaceMember.findFirst.mockResolvedValue(null);
    await getWorkspaceMembership("user_1");
    expect(mockPrisma.workspaceMember.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.workspaceMember.findFirst).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    });
  });

  it("rejects cookie values that are not workspace ids", () => {
    expect(isPlausibleWorkspaceId("cmabc123def456ghi")).toBe(true);
    expect(isPlausibleWorkspaceId("")).toBe(false);
    expect(isPlausibleWorkspaceId("x'; drop table")).toBe(false);
    expect(isPlausibleWorkspaceId(undefined)).toBe(false);
  });

  it("normalizes workspace names", () => {
    expect(normalizeWorkspaceName("  Settr  ")).toBe("Settr");
    expect(normalizeWorkspaceName("   ")).toBeNull();
    expect(normalizeWorkspaceName("x".repeat(61))).toBeNull();
    expect(normalizeWorkspaceName(42)).toBeNull();
  });
});

const startscalrAccount = {
  id: "acc_ss",
  username: "startscalr_sohum",
  workspace: { name: "Startscalr" },
};
const settrAccount = {
  id: "acc_settr",
  username: "trysettr",
  workspace: { name: "Settr" },
};

describe("brand account selection", () => {
  it("picks the oldest Startscalr account by default, as the scripts always did", () => {
    expect(
      selectBrandAccount([startscalrAccount, settrAccount], "startscalr")
    ).toBe(startscalrAccount);
    // Even if Settr was connected first, a Startscalr drop never lands on it.
    expect(
      selectBrandAccount([settrAccount, startscalrAccount], "startscalr")
    ).toBe(startscalrAccount);
  });

  it("never lets a Settr campaign land on the Startscalr account", () => {
    expect(
      selectBrandAccount([startscalrAccount, settrAccount], "settr", "trysettr")
    ).toBe(settrAccount);
    expect(() =>
      selectBrandAccount([startscalrAccount], "settr", "trysettr")
    ).toThrow(/Settr/);
    expect(() =>
      selectBrandAccount(
        [startscalrAccount, settrAccount],
        "settr",
        "startscalr_sohum"
      )
    ).toThrow(/not connected to the settr workspace/);
  });

  it("accepts a handle with or without @, in any case", () => {
    expect(selectBrandAccount([settrAccount], "settr", "@TrySettr")).toBe(
      settrAccount
    );
  });

  it("guards bind scripts against the wrong account", () => {
    expect(() =>
      assertCampaignAccount(startscalrAccount, { brand: "settr" })
    ).toThrow(/refusing/);
    expect(() =>
      assertCampaignAccount(startscalrAccount, { username: "trysettr" })
    ).toThrow(/refusing/);
    expect(() =>
      assertCampaignAccount(settrAccount, { brand: "settr", username: "@trysettr" })
    ).not.toThrow();
    expect(() => assertCampaignAccount(startscalrAccount, {})).not.toThrow();
  });
});

const spec: GuideCampaignSpec = {
  name: "Guide drop: lead follow-up",
  keywords: ["FOLLOWUP", "followup", " FOLLOWUP "],
  guideUrl: "https://example.notion.site/guide",
  guideTopic: "following up with every lead in 30 seconds",
};

function deterministicSlugs() {
  let n = 0;
  return () => `slug_${++n}`;
}

describe("guide campaign brand profiles", () => {
  it("defaults to startscalr and rejects unknown brands", () => {
    expect(resolveGuideBrand(undefined)).toBe("startscalr");
    expect(resolveGuideBrand("Settr")).toBe("settr");
    expect(() => resolveGuideBrand("acme")).toThrow(/spec.brand/);
  });

  it("builds byte-for-byte the campaign the script built before profiles", () => {
    // The data guide-campaign.mts passed to automation.create before brand
    // profiles existed, copied verbatim from that version of the script.
    const FREE_GIFT = {
      title: "Hey! I wanna give you a FREE GIFT that will jumpstart scaling with AI.",
      subtitle: "CLAIM YOUR FREE GIFT BELOW",
      buttonLabel: "FREE GIFT!",
      url: "https://shop.startscalr.com/free",
      imageUrl:
        "https://cdn.phototourl.com/free/2026-09-03-98341ab0-67c0-4911-9b52-07addc41f9b5.png",
      imageAspect: "square",
      delayMinutes: 240,
    };
    const DEFAULTS = {
      followPromptMessage:
        "hey {username} - the guide is yours, free. one thing first: follow me so you actually see the next one. tap below once you're following and i'll send it straight over.",
      followPromptButtonLabel: "i'm following",
      linkButtonLabel: "get the guide",
      publicReplies: [
        "just sent it to your DMs 🙌 lemme know if it came through!",
        "DM'd you just now 📩 tell me if you got it!",
        "it's sitting in your DMs 👀 shout if it didn't land!",
        "sent it over ✅ lemme know if you see it!",
        "check your inbox 💌 hit me back if it's not there!",
      ],
    };
    const keywords = validateGuideSpec(spec);
    const linkSlug = deterministicSlugs();
    const account = { workspaceId: "ws_ss", id: "acc_ss" };
    const legacy = {
      workspaceId: account.workspaceId,
      instagramAccountId: account.id,
      name: spec.name,
      keywords,
      wholeWordMatch: true,
      matchAnyPost: false,
      pendingNextReel: true,
      isActive: false,
      dmTriggerEnabled: true,
      dmMessage: `here is the link to the guide about ${spec.guideTopic}. ENJOY! {link}`,
      linkButtonLabel: DEFAULTS.linkButtonLabel,
      requireFollow: true,
      followPromptMessage: DEFAULTS.followPromptMessage,
      followPromptButtonLabel: DEFAULTS.followPromptButtonLabel,
      publicReplyEnabled: true,
      publicReplyMessages: DEFAULTS.publicReplies,
      publicReplyMessage: DEFAULTS.publicReplies[0],
      followUpEnabled: true,
      followUpDelayMinutes: FREE_GIFT.delayMinutes,
      followUpMessage: `one more thing {username}. i've got a free gift that pairs with that guide - claim it here: ${FREE_GIFT.url}`,
      followUpCardTitle: FREE_GIFT.title,
      followUpCardSubtitle: FREE_GIFT.subtitle,
      followUpButtonLabel: FREE_GIFT.buttonLabel,
      followUpLinkUrl: FREE_GIFT.url,
      followUpImageUrl: FREE_GIFT.imageUrl,
      followUpImageAspect: FREE_GIFT.imageAspect,
      reportShareSlug: "report_1",
      trackedLinks: {
        create: [
          {
            workspaceId: account.workspaceId,
            slug: linkSlug(),
            label: "Primary campaign link",
            destinationUrl: spec.guideUrl,
            purpose: "REVEAL",
          },
          {
            workspaceId: account.workspaceId,
            slug: linkSlug(),
            label: FREE_GIFT.buttonLabel,
            destinationUrl: FREE_GIFT.url,
            purpose: "FOLLOWUP",
          },
        ],
      },
    };

    const built = buildGuideAutomationData({
      spec,
      keywords,
      profile: GUIDE_CAMPAIGN_PROFILES[resolveGuideBrand(undefined)],
      workspaceId: account.workspaceId,
      instagramAccountId: account.id,
      trackedLinkSlug: deterministicSlugs(),
      reportShareSlug: () => "report_1",
    });

    expect(JSON.stringify(built)).toBe(JSON.stringify(legacy));
  });

  const settr = GUIDE_CAMPAIGN_PROFILES.settr;
  const settrStrings = [
    settr.followPromptMessage,
    settr.followPromptButtonLabel,
    settr.linkButtonLabel,
    settr.revealDm("a topic"),
    ...settr.publicReplies,
    settr.followUp!.message,
    settr.followUp!.cardTitle,
    settr.followUp!.cardSubtitle,
    settr.followUp!.buttonLabel,
  ];

  it("keeps Settr copy free of dashes, emoji and exclamation marks", () => {
    for (const text of settrStrings) {
      expect(text, text).not.toMatch(/[—–]/);
      expect(text, text).not.toMatch(/\s-\s/);
      expect(text, text).not.toMatch(/!/);
      expect(text, text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    expect(settr.publicReplies).toHaveLength(5);
    expect(settr.defaultAccountUsername).toBe("trysettr");
  });

  it("points the Settr follow-up at the booking page, never Startscalr", () => {
    const built = buildGuideAutomationData({
      spec: { ...spec, brand: "settr" },
      keywords: validateGuideSpec(spec),
      profile: settr,
      workspaceId: "ws_settr",
      instagramAccountId: "acc_settr",
      trackedLinkSlug: deterministicSlugs(),
      reportShareSlug: () => "r",
    });
    expect(built).toMatchObject({
      followUpEnabled: true,
      followUpLinkUrl: "https://settr.app/book-a-call",
      followUpDelayMinutes: 240,
      followUpCardTitle: "Want this built around your tools?",
    });
    expect(JSON.stringify(built)).not.toMatch(/startscalr/i);
    expect(built.trackedLinks.create.map((l) => l.purpose)).toEqual([
      "REVEAL",
      "FOLLOWUP",
    ]);
  });

  it("drops the follow-up entirely when the spec says followUp: false", () => {
    const built = buildGuideAutomationData({
      spec: { ...spec, brand: "settr", followUp: false },
      keywords: validateGuideSpec(spec),
      profile: settr,
      workspaceId: "ws_settr",
      instagramAccountId: "acc_settr",
      trackedLinkSlug: deterministicSlugs(),
      reportShareSlug: () => "r",
    });
    expect(built.followUpEnabled).toBe(false);
    expect(built).not.toHaveProperty("followUpLinkUrl");
    expect(built.trackedLinks.create.map((l) => l.purpose)).toEqual(["REVEAL"]);
  });
});
