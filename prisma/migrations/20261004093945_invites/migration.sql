-- CreateTable
CREATE TABLE "InviteJoin" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "invitedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteJoin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InviteJoin_guildId_inviterId_idx" ON "InviteJoin"("guildId", "inviterId");

-- CreateIndex
CREATE UNIQUE INDEX "InviteJoin_guildId_invitedId_key" ON "InviteJoin"("guildId", "invitedId");
