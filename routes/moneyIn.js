import prisma from "../prisma.js";
import express from "express";

const router = express.Router();

// Create money in
router.post('/', async (req, res) => {
    const { name, amount, description, userId, finishedObjectId } = req.body;
    try{
        const createMoneyIn = await prisma.moneyIn.create({
            data: {
                name, amount, description, userId, finishedObjectId
            }
        });
        res.status(201).json(createMoneyIn);
    } catch (error){
        res.status(500).json({ error: "Could not create money in."});
        console.log(error);
    }
});

// View all money in
router.get('/', async (req, res) => {
    const moneyin = await prisma.moneyIn.findMany();
    res.json(moneyin);
});

// Edit money in record
router.patch('/:id', async (req, res) => {
    try{
        const { name, amount, description } = req.body;
        const id = parseInt(req.params.id);
        const moneyin = await prisma.moneyIn.update({
            where: {id: id},
            data: { name, amount, description }
        });
        res.json(moneyin)
    } catch (error){
        res.status(500).json({ error: "Could not update money in record." });
        console.log(error);
    }
})

export default router;