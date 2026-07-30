import prisma from "../prisma.js";
import express from "express";
import parseId from "../utils/parseId.js";
import {validateString, validateDecimalString, validatePositiveInteger} from "../utils/validators.js";
import handlePrismaError from "../utils/prismaErrorHandler.js";
import createFinishedObject from "../services/finishedObjectService.js";
import { Decimal } from '@prisma/client/runtime/library';

const router = express.Router();

router.post('/', async (req, res) => {
    try{
        const { name, category, askingPrice, userId, materials } = req.body;

        // validations

        const createFO = await createFinishedObject(name, category, askingPrice, userId, materials);

        res.status(201).json(createFO);
    } catch (error) {
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not create finished object.' });
    }
    
});

// Finsihed objects - view all
router.get('/', async (req, res) => {
    try{
       const fos = await prisma.finishedObject.findMany();
        res.json(fos); 
    } catch (error){
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not view all finished objects.' });
    }
});

// Finished object - get by id
router.get('/:id', async (req, res) => {
    try{
        const id = parseId(req.params.id)
        if (id == null) return res.status(400).json({ error: "Id must be a positive integer" });

        const finishedObject = await prisma.finishedObject.findUnique({
            where: { id: id },
        }) 
        if(!finishedObject){
            return res.status(404).json({ error: "Finished object does not exist." });
        }
        res.json(finishedObject);
    } catch (error) {
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not get finished object.' });
    } 
});

// Finished object - update attributes
router.patch('/:id', async (req, res) => {
    try{
        const id = parseId(req.params.id)
        if (id == null) return res.status(400).json({ error: "Id must be a positive integer" });

        if (name === undefined && askingPrice === undefined && pricePerUnit === undefined && description === undefined) {
            return res.status(400).json({ error: "Must have at least one present field to patch." });
        }

        const errors = [
            validateString(name, { fieldName: 'name', required: false, maxLength: 100}),
            validateDecimalString(askingPrice, { fieldName: 'askingPrice', required: false, maxDecimalPlaces: 2}),
            validateString(description, { fieldName: 'description', required: false, maxLength: 400})
        ].filter(Boolean);

        if(errors.length) return res.status(400).json({ errors });

        const {name, description, askingPrice, status} = req.body;
        const fo = await prisma.finishedObject.update({
            where: {id: id},
            data: { name, description, askingPrice, status }
        });
        res.json(fo);
    } catch (error){
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not get finished object.' });
    }
})

export default router;