import prisma from "../prisma.js";
import express from "express";
import parseId from "../utils/parseId.js";
import {validateString, validateDecimalString, validatePositiveInteger} from "../utils/validators.js";
import handlePrismaError from "../utils/prismaErrorHandler.js";

const router = express.Router();

// Create Expense
router.post('/', async (req, res) => {
    try{
        const { name, cost, materialId, description, userId } = req.body;

        const errors = [
            validateString(name, { fieldName: 'name', required: true, maxLength: 100}),
            validateDecimalString(cost, { fieldName: 'cost', required: true, maxDecimalPlaces: 2}),
            validatePositiveInteger(materialId, { fieldName: 'materialId', required: false, nullable: true}),
            validateString(description, { fieldName: 'description', required: true, maxLength: 400}),
            validatePositiveInteger(userId, { fieldName: 'userId', required: true})
        ].filter(Boolean);

        if(errors.length) return res.status(400).json({ errors });

        const createExpense = await prisma.expense.create({
            data: {
                name, cost, materialId, description, userId
            }
        });
        res.status(201).json(createExpense);
    } catch (error){
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not create expense.' });
    }
});

// View all expenses
router.get('/', async (req, res) => {
    try{
        const expenses = await prisma.expense.findMany();
        res.json(expenses); 
    } catch (error){
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not view all expenses.' });
    }
    
});

// Update/Edit an expense
router.patch('/:id', async (req, res) => {
    try{
        const id = parseId(req.params.id)
        if (id == null) return res.status(400).json({ error: "Id must be a positive integer" });

        const { name, cost, description } = req.body;

        if(name === undefined && cost === undefined && description === undefined) return res.status(400).json({ error: "Must have at least one field to patch." });

        const errors = [
            validateString(name, { fieldName: 'name', required: false, maxLength: 100}),
            validateDecimalString(cost, { fieldName: 'cost', required: false, maxDecimalPlaces: 2}),
            validateString(description, { fieldName: 'description', required: false, maxLength: 400})
        ].filter(Boolean);

        if(errors.length) return res.status(400).json({ errors });

        const expense = await prisma.expense.update({
            where: {id: id},
            data: { name, cost, description }
        });
        res.json(expense)
    } catch (error){
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not patch expense.' });
    }
})

export default router;