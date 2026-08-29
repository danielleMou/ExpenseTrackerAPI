import prisma from "../prisma.js";
import express from "express";
import parseId from "../utils/parseId.js";
import {validateString, validateDecimalString, validatePositiveInteger} from "../utils/validators.js";
import handlePrismaError from "../utils/prismaErrorHandler.js";
import { createFinishedObject, hideUnsoldFO, updateFinishedObject } from "../services/finishedObjectService.js";
import { Decimal } from '@prisma/client/runtime/library';
import { processSoldFo } from "../services/soldQueueService.js";

const router = express.Router();

// create a finished object
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
        if (error.code == 'MATERIAL_NONEXISTENT') return res.status(404).json({ error: "Material id does not exist"});
        if (error.code == 'INSUFFICIENT_STOCK') return res.status(400).json({ error: "Not enough material stock."});
        res.status(500).json({ error: 'Could not create finished object.' });
    }
    
});

// Finished objects - hides unsold FOs - soft delete
router.delete('/:id', async (req, res) => {
    try{
        const id = parseId(req.params.id)
        if (id == null) return res.status(400).json({ error: "Id must be a positive integer" });

        const { userId } = req.body;
        const errors = [ validatePositiveInteger(userId, { fieldName: 'userId', required: true}) ].filter(Boolean);
        if(errors.length) return res.status(400).json({ errors });

        const hideFO = await hideUnsoldFO(id, userId);
        res.status(200).json(hideFO);

    } catch (error){
        console.log(error);
        if (handlePrismaError(error, res)) return;
        if (error.code == 'FO_NONEXISTENT') return res.status(404).json({ error: "FO id does not exist"});
        if (error.code == 'FO_SOLD') return res.status(400).json({ error: "FO already sold"});
        res.status(500).json({ error: 'Could not delete finished object.' });
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
        if(finishedObject == undefined){
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

        const {name, description, askingPrice, status, userId} = req.body;

        if (name === undefined && askingPrice === undefined && description === undefined && status === undefined) {
            return res.status(400).json({ error: "Must have at least one present field to patch." });
        }

        if (req.body == []) return res.status(400).json({ error: "Must have at least one present field to patch." });

        const errors = [
            validateString(name, { fieldName: 'name', required: false, maxLength: 100}),
            validateString(status, { fieldName: 'status', required: false, maxLength: 10}),
            validateDecimalString(askingPrice, { fieldName: 'askingPrice', required: false, maxDecimalPlaces: 2}),
            validateString(description, { fieldName: 'description', required: false, maxLength: 400}),
            validatePositiveInteger(userId, { fieldName: 'userId', required: true})
        ].filter(Boolean);

        if(errors.length) return res.status(400).json({ errors });

        const fo = await updateFinishedObject(id, name, description, askingPrice, status, userId);

        res.status(200).json(fo);
    } catch (error){
        console.log(error);
        if (handlePrismaError(error, res)) return;
        if (error.code == 'FO_NONEXISTENT') return res.status(404).json({ error: "FO id does not exist"});
        res.status(500).json({ error: 'Could not update finished object.' });
    }
})

// process sold fo
router.post('/:id/process', async (req, res) => {
    try{
        const id = parseId(req.params.id)
        if (id == null) return res.status(400).json({ error: "Id must be a positive integer" });

        const {salePrice, expenses, userId} = req.body;

        const errors = [
            validateDecimalString(salePrice, { fieldName: 'salePrice', required: true, maxDecimalPlaces: 2}),
            validatePositiveInteger(userId, { fieldName: 'userId', required: true})
        ].filter(Boolean);

        if(!Array.isArray(expenses)) return res.status(400).json({ error : "Expenses must be an array of the form: [{name, cost, description}, ... ]." });
        // if(expenses.length <= 0) return res.status(400).json({ error : "Expenses array must be non-empty." });
        for(const ex of expenses){
            if(ex.name == null) return res.status(400).json({error : "Expenses must have a name." });
            if(ex.cost == null) return res.status(400).json({ error : "Expenses must have a cost." });
            if(ex.description == null) return res.status(400).json({ error : "Expenses must have a description." });

            const errors = [
                validateString(ex.name, { fieldName: 'name', required: true, maxLength: 50}),
                validateDecimalString(ex.cost, { fieldName: 'cost', required: true, maxDecimalPlaces: 2}),
                validateString(ex.description, { fieldName: 'description', required: true, maxLength: 200})
            ].filter(Boolean);
            if(errors.length) return res.status(400).json({ errors });
        }

        if(errors.length) return res.status(400).json({ errors });

        const fo = await processSoldFo(id, salePrice, expenses, userId);

        res.status(200).json(fo);
    } catch (error){
        console.log(error);
        if (handlePrismaError(error, res)) return;
        if (error.code == 'FO_NONEXISTENT') return res.status(404).json({ error: "FO id does not exist"});
        if (error.code == 'FO_INVALID') return res.status(400).json({ error: "FO must be sold and not already be processed or deleted"});
        res.status(500).json({ error: 'Could not update finished object.' });
    }
})

export default router;