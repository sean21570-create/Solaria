-- CreateTable
CREATE TABLE "MatchProfile" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchLike" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "MatchLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchProfile_messageId_key" ON "MatchProfile"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchProfile_guildId_userId_key" ON "MatchProfile"("guildId", "userId");

-- CreateIndex
CREATE INDEX "MatchLike_userId_idx" ON "MatchLike"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchLike_profileId_userId_key" ON "MatchLike"("profileId", "userId");

-- AddForeignKey
ALTER TABLE "MatchLike" ADD CONSTRAINT "MatchLike_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "MatchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
