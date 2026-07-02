import prisma from "../prisma.js";
import express from "express";

const router = express.Router();

// view stock logs
router.get('/stock', async (req, res) => {
    const stockLogs = await prisma.stockLog.findMany();
    res.json(stockLogs);
});

// view financial logs
router.get('/financial', async (req, res) => {
    const financiallogs = await prisma.financialLog.findMany();
    res.json(financiallogs);
});

// view fo logs 
router.get('/finishedobject', async (req, res) => {
    const fologs = await prisma.fOlog.findMany();
    res.json(fologs);
});

export default router;