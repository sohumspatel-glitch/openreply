/**
 * Brand profiles for scripts/guide-campaign.mts.
 *
 * A guide drop is the same campaign shape for every brand (follow gate, reveal
 * DM with the guide link, public replies, optional follow-up card). What
 * differs is the voice and where the follow-up points, so that lives here,
 * keyed by brand. A spec with no "brand" gets "startscalr", whose profile is
 * the exact copy the script hardcoded before profiles existed.
 *
 * Pure: no Prisma, no env. The script supplies the account and the slug
 * generators, which keeps the data it writes testable.
 */
import { BRANDS, DEFAULT_BRAND_KEY, type BrandKey } from "./branding";

export interface GuideFollowUp {
  delayMinutes: number;
  /** Plain-text body, also the fallback if Meta rejects the card. */
  message: string;
  cardTitle: string;
  cardSubtitle: string;
  buttonLabel: string;
  url: string;
  imageUrl: string | null;
  imageAspect: string | null;
  /** Label of the FOLLOWUP tracked link that attributes card clicks. */
  trackedLinkLabel: string;
}

export interface GuideCampaignProfile {
  brand: BrandKey;
  /**
   * The Instagram handle this brand's campaigns must land on, or null to use
   * the brand workspace's oldest account (the original Startscalr behaviour).
   */
  defaultAccountUsername: string | null;
  followPromptMessage: string;
  followPromptButtonLabel: string;
  linkButtonLabel: string;
  publicReplies: string[];
  revealDm: (guideTopic: string) => string;
  /** null = the brand has no follow-up card at all. */
  followUp: GuideFollowUp | null;
}

/** The lead magnet at the end of every Startscalr drop. Same page every time. */
const STARTSCALR_FREE_GIFT = {
  title: "Hey! I wanna give you a FREE GIFT that will jumpstart scaling with AI.",
  subtitle: "CLAIM YOUR FREE GIFT BELOW",
  buttonLabel: "FREE GIFT!",
  url: "https://shop.startscalr.com/free",
  imageUrl:
    "https://cdn.phototourl.com/free/2026-09-03-98341ab0-67c0-4911-9b52-07addc41f9b5.png",
  imageAspect: "square",
  delayMinutes: 240,
};

const SETTR_BOOK_A_CALL = "https://settr.app/book-a-call";

export const GUIDE_CAMPAIGN_PROFILES: Record<BrandKey, GuideCampaignProfile> = {
  // Byte-for-byte the copy guide-campaign.mts shipped with. Do not edit
  // without meaning to change every future Startscalr drop.
  startscalr: {
    brand: "startscalr",
    defaultAccountUsername: null,
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
    revealDm: (guideTopic) =>
      `here is the link to the guide about ${guideTopic}. ENJOY! {link}`,
    followUp: {
      delayMinutes: STARTSCALR_FREE_GIFT.delayMinutes,
      message: `one more thing {username}. i've got a free gift that pairs with that guide - claim it here: ${STARTSCALR_FREE_GIFT.url}`,
      cardTitle: STARTSCALR_FREE_GIFT.title,
      cardSubtitle: STARTSCALR_FREE_GIFT.subtitle,
      buttonLabel: STARTSCALR_FREE_GIFT.buttonLabel,
      url: STARTSCALR_FREE_GIFT.url,
      imageUrl: STARTSCALR_FREE_GIFT.imageUrl,
      imageAspect: STARTSCALR_FREE_GIFT.imageAspect,
      trackedLinkLabel: STARTSCALR_FREE_GIFT.buttonLabel,
    },
  },

  // Settr voice = Sohum texting one business contact: casual, warm, direct, a
  // friendly founder. Talk to one person ("you", never "you guys"), "…" as the
  // soft pause, no dashes of any kind, no emoji, no slang, exclamation marks
  // only on a greeting ("Hey!"). An Instagram username is not a first name, so
  // no {username} greeting. The test suite enforces all of that.
  settr: {
    brand: "settr",
    defaultAccountUsername: "trysettr",
    followPromptMessage:
      "Hey! It's yours… just follow @trysettr first so you catch the next one, then tap below and I'll send it right over.",
    followPromptButtonLabel: "I'm following",
    linkButtonLabel: "Open the guide",
    publicReplies: [
      "Just sent it to your DMs… let me know if it came through.",
      "Sent it over… have a look in your DMs.",
      "It's in your DMs now… let me know if you got it.",
      "Just DM'd you… tell me if it didn't land.",
      "Sent… check your DMs when you get a sec.",
    ],
    revealDm: (guideTopic) => `Here you go… the guide on ${guideTopic}. {link}`,
    followUp: {
      delayMinutes: 240,
      message:
        "Hey! Did you get a chance to look through it? If you want this running on your own calls and DMs, I'd love to show you how it would look. What day works for a quick call?",
      cardTitle: "Want this built around your tools?",
      cardSubtitle: "Quick call… I'll show you how it would look for your business.",
      buttonLabel: "Book a call",
      url: SETTR_BOOK_A_CALL,
      imageUrl: null,
      imageAspect: null,
      trackedLinkLabel: "Book a call",
    },
  },
};

export interface GuideCampaignSpec {
  /** Brand profile to use. Omitted = "startscalr". */
  brand?: string;
  name: string;
  /** Main keyword plus every variation a commenter might actually type. */
  keywords: string[];
  /** Public Notion URL for this drop's guide. */
  guideUrl: string;
  /** One line describing the guide, dropped into the reveal DM. */
  guideTopic: string;
  /**
   * Instagram handle to attach to (with or without @). Must belong to the
   * brand's workspace. Omitted = the profile's defaultAccountUsername.
   */
  account?: string;
  /** false drops the follow-up card. Omitted = the profile's default. */
  followUp?: boolean;
}

export function resolveGuideBrand(brand: unknown): BrandKey {
  if (brand === undefined || brand === null || brand === "") {
    return DEFAULT_BRAND_KEY;
  }
  if (typeof brand === "string") {
    const key = brand.trim().toLowerCase();
    if (key in BRANDS) return key as BrandKey;
  }
  throw new Error(
    `spec.brand must be one of: ${Object.keys(BRANDS).join(", ")} (got ${JSON.stringify(brand)})`
  );
}

/** Validated keywords, or a thrown error naming the bad field. */
export function validateGuideSpec(spec: GuideCampaignSpec): string[] {
  for (const field of ["name", "guideUrl", "guideTopic"] as const) {
    if (!spec[field]?.trim()) throw new Error(`spec.${field} is required`);
  }
  const keywords = [
    ...new Set((spec.keywords ?? []).map((k) => k.trim()).filter(Boolean)),
  ];
  if (keywords.length === 0) {
    throw new Error("spec.keywords must have at least one keyword");
  }
  if (!/^https:\/\//.test(spec.guideUrl)) {
    throw new Error("guideUrl must be https");
  }
  if (spec.followUp !== undefined && typeof spec.followUp !== "boolean") {
    throw new Error("spec.followUp must be true or false");
  }
  return keywords;
}

/**
 * The Prisma `automation.create` data for a guide drop.
 *
 * Created INACTIVE and pendingNextReel, so it matches nothing until a bind
 * script attaches it to the post that goes live.
 */
export function buildGuideAutomationData({
  spec,
  keywords,
  profile,
  workspaceId,
  instagramAccountId,
  trackedLinkSlug,
  reportShareSlug,
}: {
  spec: GuideCampaignSpec;
  keywords: string[];
  profile: GuideCampaignProfile;
  workspaceId: string;
  instagramAccountId: string;
  trackedLinkSlug: () => string;
  reportShareSlug: () => string;
}) {
  const followUp = spec.followUp === false ? null : profile.followUp;

  return {
    workspaceId,
    instagramAccountId,
    name: spec.name,
    keywords,
    wholeWordMatch: true,
    // Waits for the reel. matchAnyPost stays false so it can never fire on the
    // back catalogue while it is waiting.
    matchAnyPost: false,
    pendingNextReel: true,
    // Published only once the reel is bound.
    isActive: false,
    dmTriggerEnabled: true,
    dmMessage: profile.revealDm(spec.guideTopic),
    linkButtonLabel: profile.linkButtonLabel,
    requireFollow: true,
    followPromptMessage: profile.followPromptMessage,
    followPromptButtonLabel: profile.followPromptButtonLabel,
    publicReplyEnabled: true,
    publicReplyMessages: profile.publicReplies,
    publicReplyMessage: profile.publicReplies[0],
    ...(followUp
      ? {
          followUpEnabled: true,
          followUpDelayMinutes: followUp.delayMinutes,
          followUpMessage: followUp.message,
          followUpCardTitle: followUp.cardTitle,
          followUpCardSubtitle: followUp.cardSubtitle,
          followUpButtonLabel: followUp.buttonLabel,
          followUpLinkUrl: followUp.url,
          followUpImageUrl: followUp.imageUrl,
          followUpImageAspect: followUp.imageAspect,
        }
      : { followUpEnabled: false }),
    reportShareSlug: reportShareSlug(),
    trackedLinks: {
      create: [
        {
          workspaceId,
          slug: trackedLinkSlug(),
          label: "Primary campaign link",
          destinationUrl: spec.guideUrl,
          purpose: "REVEAL" as const,
        },
        ...(followUp
          ? [
              {
                workspaceId,
                slug: trackedLinkSlug(),
                label: followUp.trackedLinkLabel,
                destinationUrl: followUp.url,
                purpose: "FOLLOWUP" as const,
              },
            ]
          : []),
      ],
    },
  };
}
