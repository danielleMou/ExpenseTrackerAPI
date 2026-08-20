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
        const { name, description, categoryId, askingPrice, userId, materials } = req.body;

        // validate materials array - should be of form [{materialId, quantityUsed}, ... ]
        if(!Array.isArray(materials)) return res.status(400).json({ error : "Materials must be an array of the form: [{materialId, quantityUsed}, ... ]." });
        if(materials.length <= 0) return res.status(400).json({ error : "Materials array must be non-empty." });
        for(const material of materials){
            if(material.materialId == null) return res.status(400).json({error : "Materials must contain a materialId." });
            if(material.quantityUsed == null) return res.status(400).json({ error : "Materials must contain a quantity used." });

            const errors = [
                validatePositiveInteger(material.materialId, { fieldName: 'materialId', required: true}),
                validateDecimalString(material.quantityUsed, { fieldName: 'quantityUsed', required: true, maxDecimalPlaces: 2})
            ].filter(Boolean);
            if(errors.length) return res.status(400).json({ errors });
        }
        // check for duplicate material ids - use map
        const materialsSet = new Set();
        for(const material of materials){
            if(materialsSet.has(material.materialId)) return res.status(400).json({ error : "Materials array cannot contain duplicate entries." });
            materialsSet.add(material.materialId);
        }

        // validations
        const errors = [
            validateString(name, { fieldName: 'name', required: false, maxLength: 100}),
            validateString(description, { fieldName: 'description', required: false, maxLength: 400}),
            validatePositiveInteger(categoryId, { fieldName: 'categoryId', required: true}),
            validateDecimalString(askingPrice, { fieldName: 'askingPrice', required: false, maxDecimalPlaces: 2}),
            validatePositiveInteger(userId, { fieldName: 'userId', required: true})
        ].filter(Boolean);
        if(errors.length) return res.status(400).json({ errors });

        const createFO = await createFinishedObject(name, description, categoryId, askingPrice, userId, materials);

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