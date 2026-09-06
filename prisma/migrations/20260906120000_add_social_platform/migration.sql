-- Facebook Pages live in the same table as Instagram accounts. They share an
-- id in Meta's id space, a long-lived token, a webhook subscription, the
-- one-private-reply-per-comment rule with a seven day window, and the same
-- Send API request shape. Only the host, the token's provenance, and a few
-- capabilities differ, and those are handled in code rather than in storage.
--
-- Existing rows are all Instagram, which is what the default encodes.
CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM', 'FACEBOOK');

ALTER TABLE "InstagramAccount"
  ADD COLUMN "platform" "SocialPlatform" NOT NULL DEFAULT 'INSTAGRAM';
