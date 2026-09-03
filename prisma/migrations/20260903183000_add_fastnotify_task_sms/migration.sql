-- Additive-only migration for task SMS delivery. Existing users and tasks are preserved.
ALTER TABLE "User" ADD COLUMN "mobile" TEXT;

ALTER TABLE "Task" ADD COLUMN "assignedUserId" TEXT
  REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FastNotifySmsDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventKey" TEXT NOT NULL,
    "taskId" TEXT,
    "recipientUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "providerRequestId" TEXT,
    "providerReferences" TEXT,
    "lastErrorCode" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FastNotifySmsDelivery_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FastNotifySmsDelivery_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FastNotifySmsDelivery_eventKey_key" ON "FastNotifySmsDelivery"("eventKey");
CREATE INDEX "FastNotifySmsDelivery_taskId_idx" ON "FastNotifySmsDelivery"("taskId");
CREATE INDEX "FastNotifySmsDelivery_recipientUserId_idx" ON "FastNotifySmsDelivery"("recipientUserId");
CREATE INDEX "FastNotifySmsDelivery_status_idx" ON "FastNotifySmsDelivery"("status");
CREATE INDEX "Task_assignedUserId_idx" ON "Task"("assignedUserId");
