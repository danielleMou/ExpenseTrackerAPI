import prisma from "../prisma.js";
import express from "express";

const router = express.Router();

// view stock logs
router.get('/stock', async (req, res) => {
    try{
        const userId = req.user.id;

        const stockLogs = await prisma.stockLog.findMany({ where: { userId }});
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
        const userId = req.user.id;

        const financiallogs = await prisma.financialLog.findMany({ where: { userId }});
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
        const userId = req.user.id;

        const fologs = await prisma.fOlog.findMany({ where: { userId }});
        res.json(fologs); 
    } catch (error){
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not get logs.' });
    }
    
});

export default router;