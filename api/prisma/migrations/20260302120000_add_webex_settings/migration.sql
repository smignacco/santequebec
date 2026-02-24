-- AlterTable
ALTER TABLE "AppSettings"
ADD COLUMN "webexEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "webexBotToken" TEXT,
ADD COLUMN "webexRoomId" TEXT,
ADD COLUMN "webexNotifyOnSubmit" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "webexNotifyOnHelp" BOOLEAN NOT NULL DEFAULT true;
