-- Records the "DM me the keyword" nudge posted under a comment when Instagram
-- refused to open a DM thread, so it is never posted twice.
ALTER TABLE "DmLog" ADD COLUMN "fallbackReplySentAt" TIMESTAMP(3);
