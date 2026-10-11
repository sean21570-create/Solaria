-- CreateTable
CREATE TABLE "BlacklistWord" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlacklistWord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlacklistWord_guildId_idx" ON "BlacklistWord"("guildId");
