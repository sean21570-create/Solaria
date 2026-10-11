-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "objectiveDescription" TEXT NOT NULL DEFAULT 'Au 300 membres NoName fait un live et un event Discord où il vous aide à gérer vos crush (et à la fin il dit à la sienne qu''il la kiffe).',
ADD COLUMN     "objectiveReached" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "objectiveTarget" INTEGER NOT NULL DEFAULT 300;
