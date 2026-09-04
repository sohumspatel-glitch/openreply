-- Meta renders card images at 1.91:1 and center-crops anything else. Storing
-- "square" lets a 1:1 creative through whole. Null keeps the 1.91:1 default.
ALTER TABLE "Automation" ADD COLUMN "followUpImageAspect" TEXT;
