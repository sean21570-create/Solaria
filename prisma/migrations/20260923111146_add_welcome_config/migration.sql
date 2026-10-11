-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "unverifiedRoleId" TEXT,
ADD COLUMN     "verifiedRoleId" TEXT,
ADD COLUMN     "welcomeChannelId" TEXT,
ADD COLUMN     "welcomeMessage" TEXT;
