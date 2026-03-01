ALTER TABLE "AppSettings"
ADD COLUMN "reminderFollowUpBusinessDays" INTEGER NOT NULL DEFAULT 5;

DROP INDEX "ReminderApproval_inventoryFileId_loginAuditLogId_key";
