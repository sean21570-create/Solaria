-- CreateTable
CREATE TABLE "MemberStats" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "mentionCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberStats_guildId_userId_idx" ON "MemberStats"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberStats_guildId_userId_key" ON "MemberStats"("guildId", "userId");
