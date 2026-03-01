CREATE TABLE "ReminderApproval" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "inventoryFileId" TEXT NOT NULL,
  "loginAuditLogId" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "remainingCount" INTEGER NOT NULL,
  "totalCount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "approvedByName" TEXT,
  "approvedByEmail" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectedByName" TEXT,
  "rejectedByEmail" TEXT,
  "rejectionReason" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReminderApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReminderApproval_inventoryFileId_loginAuditLogId_key" ON "ReminderApproval"("inventoryFileId", "loginAuditLogId");
CREATE INDEX "ReminderApproval_organizationId_status_idx" ON "ReminderApproval"("organizationId", "status");
CREATE INDEX "ReminderApproval_status_requestedAt_idx" ON "ReminderApproval"("status", "requestedAt");

ALTER TABLE "ReminderApproval"
ADD CONSTRAINT "ReminderApproval_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReminderApproval"
ADD CONSTRAINT "ReminderApproval_inventoryFileId_fkey"
FOREIGN KEY ("inventoryFileId") REFERENCES "InventoryFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
