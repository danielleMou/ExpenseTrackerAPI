import prisma from "../prisma.js";
import express from "express";

const router = express.Router();

// view stock logs
router.get('/stock', async (req, res) => {
    try{
        const stockLogs = await prisma.stockLog.findMany();
        res.json(stockLogs);
    } catch (error){
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not get logs.' });
    }
    
});

// view financial logs
router.get('/financial', async (req, res) => {
    try{
        const financiallogs = await prisma.financialLog.findMany();
        res.json(financiallogs);
    } catch (error) {
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not get logs.' });
    }
    
});

// view fo logs 
router.get('/finishedobject', async (req, res) => {
    try {
        const fologs = await prisma.fOlog.findMany();
        res.json(fologs); 
    } catch (error){
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not get logs.' });
    }
    
});

export default router;