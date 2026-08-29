import prisma from "../prisma.js";
import express from "express";
import parseId from "../utils/parseId.js";
import {validateString, validateDecimalString, validatePositiveInteger} from "../utils/validators.js";
import handlePrismaError from "../utils/prismaErrorHandler.js";
import { createMoneyIn, deleteMoneyIn, editMoneyIn } from "../services/financialService.js";

const router = express.Router();

// Create money in
router.post('/', async (req, res) => {
    try{
        const { name, amount, description, userId, finishedObjectId } = req.body;

        const errors = [
            validateString(name, { fieldName: 'name', required: true, maxLength: 100}),
            validateDecimalString(amount, { fieldName: 'amount', required: true, maxDecimalPlaces: 2}),
            validateString(description, { fieldName: 'description', required: true, maxLength: 400}),
            validatePositiveInteger(userId, { fieldName: 'userId', required: true}),
            validatePositiveInteger(finishedObjectId, { fieldName: 'finishedObjectId', required: false, nullable: true})
        ].filter(Boolean);

        if(errors.length) return res.status(400).json({ errors });

        const moneyIn = await createMoneyIn(name, amount, description, userId, finishedObjectId);
        res.status(201).json(moneyIn);
    } catch (error){
        console.log(error);
        if (handlePrismaError(error, res)) return;
        if (error.code == 'FO_NONEXISTENT') return res.status(400).json({ error: "FO does not exist."});
        res.status(500).json({ error: 'Could not create new record.' });
    }
});

// View all money in
router.get('/', async (req, res) => {
    try{
        const moneyin = await prisma.moneyIn.findMany();
        res.json(moneyin); 
    } catch (error) {
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not view all income records.' });
    }   
});

// Edit money in record
router.patch('/:id', async (req, res) => {
    try{
        const id = parseId(req.params.id)
        if (id == null) return res.status(400).json({ error: "Id must be a positive integer" });

        const { name, amount, description, userId } = req.body;

        if (name === undefined && amount === undefined && description === undefined) {
            return res.status(400).json({ error: "Must have at least one present field to patch." });
        }

        const errors = [
            validateString(name, { fieldName: 'name', required: false, maxLength: 100}),
            validateDecimalString(amount, { fieldName: 'amount', required: false, maxDecimalPlaces: 2}),
            validateString(description, { fieldName: 'description', required: false, maxLength: 400}),
            validatePositiveInteger(userId, { fieldName: 'userId', required: true})
        ].filter(Boolean);

        if(errors.length) return res.status(400).json({ errors });

        const moneyIn = await editMoneyIn(id, name, amount, description, userId);
        
        res.json(moneyIn);
        
    } catch (error){
        console.log(error);
        if (handlePrismaError(error, res)) return;
        if (error.code == 'MONEY_IN_NONEXISTENT') return res.status(404).json({ error: "Record does not exist."});
        res.status(500).json({ error: 'Could not view all income records.' });
    }
})

router.delete('/:id', async (req, res) => {
    try{
        const id = parseId(req.params.id)
        if (id == null) return res.status(400).json({ error: "Id must be a positive integer" });

        const { userId } = req.body;
        const errors = [ validatePositiveInteger(userId, { fieldName: 'userId', required: true}) ].filter(Boolean);
        if(errors.length) return res.status(400).json({ errors });

        const deleteM = await deleteMoneyIn(id, userId);
        res.status(200).json(deleteM);

    } catch (error){
        console.log(error);
        if (handlePrismaError(error, res)) return;
        if (error.code == 'MONEY_IN_NONEXISTENT') return res.status(404).json({ error: "Record does not exist."});
        res.status(500).json({ error: 'Could not delete money in record.' });
    }
});


export default router;