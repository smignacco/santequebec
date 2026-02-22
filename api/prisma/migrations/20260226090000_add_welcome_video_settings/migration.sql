ALTER TABLE "Organization" ADD COLUMN "welcomeVideoDismissed" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AppSettings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "welcomeVideoUrl" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

INSERT INTO "AppSettings" ("id", "welcomeVideoUrl", "createdAt", "updatedAt")
VALUES ('global', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
