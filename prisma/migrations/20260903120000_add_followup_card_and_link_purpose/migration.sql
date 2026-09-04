-- The follow-up message can now be a rich link card (Meta generic template).
-- All columns are nullable, so existing campaigns keep sending plain text.
ALTER TABLE "Automation" ADD COLUMN "followUpLinkUrl" TEXT;
ALTER TABLE "Automation" ADD COLUMN "followUpButtonLabel" TEXT;
ALTER TABLE "Automation" ADD COLUMN "followUpCardTitle" TEXT;
ALTER TABLE "Automation" ADD COLUMN "followUpCardSubtitle" TEXT;
ALTER TABLE "Automation" ADD COLUMN "followUpImageUrl" TEXT;

-- Separates the reveal DM's links from the follow-up card's link. Existing
-- rows are all reveal links, which the default backfills.
ALTER TABLE "TrackedLink" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'REVEAL';
