/*
  Warnings:

  - Added the required column `productionCost` to the `FinishedObject` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "FinishedObject" ADD COLUMN     "productionCost" DECIMAL(65,30) NOT NULL;
