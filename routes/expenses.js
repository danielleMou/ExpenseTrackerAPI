import prisma from "../prisma.js";
import express from "express";

const router = express.Router();

// Create Expense
router.post('/', async (req, res) => {
    const { name, cost, materialId, description, userId } = req.body;
    try{
        const createExpense = await prisma.expense.create({
            data: {
                name, cost, materialId, description, userId
            }
        });
        res.status(201).json(createExpense);
    } catch (error){
        res.status(500).json({ error: "Could not create expense."});
        console.log(error);
    }
});

// View all expenses
router.get('/', async (req, res) => {
    const expenses = await prisma.expense.findMany();
    res.json(expenses);
});

// Update/Edit an expense
router.patch('/:id', async (req, res) => {
    try{
        const { name, cost, description } = req.body;
        const id = parseInt(req.params.id);
        const expense = await prisma.expense.update({
            where: {id: id},
            data: { name, cost, description }
        });
        res.json(expense)
    } catch (error){
        res.status(500).json({ error: "Could not update expense." });
        console.log(error);
    }
})

export default router;