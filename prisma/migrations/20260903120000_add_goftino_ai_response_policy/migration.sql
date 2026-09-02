-- Goftino AI response policies are a positive allowlist. Existing policies and
-- insurance-category data remain unchanged.
CREATE TABLE "GoftinoAiResponsePolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goftinoTopicId" TEXT NOT NULL,
    "goftinoTopicTitle" TEXT NOT NULL,
    "insuranceCategoryId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'AI_ALLOWED',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "fallbackMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GoftinoAiResponsePolicy_insuranceCategoryId_fkey"
      FOREIGN KEY ("insuranceCategoryId") REFERENCES "InsuranceCategory" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GoftinoAiResponsePolicy_goftinoTopicId_key"
  ON "GoftinoAiResponsePolicy"("goftinoTopicId");
CREATE INDEX "GoftinoAiResponsePolicy_insuranceCategoryId_idx"
  ON "GoftinoAiResponsePolicy"("insuranceCategoryId");
