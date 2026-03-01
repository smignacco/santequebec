ALTER TABLE "Organization"
ADD COLUMN "reminderNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "AppSettings"
ADD COLUMN "webexNotifyOnReminder" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "reminderEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "reminderBusinessDays" INTEGER NOT NULL DEFAULT 5;
