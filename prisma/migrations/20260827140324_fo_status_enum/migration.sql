/*
  Warnings:

  - The `status` column on the `FinishedObject` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "FOStatus" AS ENUM ('unlisted', 'listed', 'sold');

-- AlterTable
ALTER TABLE "FinishedObject" DROP COLUMN "status",
ADD COLUMN     "status" "FOStatus" NOT NULL DEFAULT 'unlisted';
