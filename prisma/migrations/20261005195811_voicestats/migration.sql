-- CreateTable
CREATE TABLE "VoiceStat" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalSeconds" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceStat_guildId_totalSeconds_idx" ON "VoiceStat"("guildId", "totalSeconds");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceStat_guildId_userId_key" ON "VoiceStat"("guildId", "userId");
