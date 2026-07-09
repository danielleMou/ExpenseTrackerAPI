import prisma from "../prisma.js";
import express from "express";
import parseId from "../utils/parseId.js";
import {validateString, validateDecimalString, validatePositiveInteger} from "../utils/validators.js";
import handlePrismaError from "../utils/prismaErrorHandler.js";

const router = express.Router();

// Get all materials
router.get('/', async (req, res) => {
    try{
       const materials = await prisma.material.findMany();
        res.json(materials); 
    } catch (error) {
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not get materials' });
    }
});

// Get material by id
router.get('/:id', async (req, res) => {
    try{
        const id = parseId(req.params.id)
        if (id == null) return res.status(400).json({ error: "Id must be a positive integer" });

        const material = await prisma.material.findUnique({
            where: { id: id },
        }) 
        if(!material){
            return res.status(404).json({ error: "Material does not exist." });
        }
        res.json(material);
    } catch (error) {
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not get material.' });
    } 
});

// Update a specific (NON-QUANTITY) field.
// partial update works because Prisma treats undefined fields as skip
router.patch('/:id', async (req, res) => {
    try{
        const { name, unit, pricePerUnit, categoryId } = req.body;
        const id = parseId(req.params.id)
        if (id == null) return res.status(400).json({ error: "Id must be a positive integer" });

        if (name === undefined && unit === undefined && pricePerUnit === undefined && categoryId === undefined) {
            return res.status(400).json({ error: "Must have at least one present field to patch." });
        }

        const errors = [
            validateString(name, { fieldName: 'name', required: false, maxLength: 100}),
            validateString(unit, { fieldName: 'unit', required: false, maxLength: 50}),
            validateDecimalString(pricePerUnit, { fieldName: 'pricePerUnit', required: false, maxDecimalPlaces: 2}),
            validatePositiveInteger(categoryId, { fieldName: 'categoryId', required: false})
        ].filter(Boolean);

        if(errors.length) return res.status(400).json({ errors });

        const material = await prisma.material.update({
            where: { id: id },
            data: { name: name, pricePerUnit: pricePerUnit, unit: unit, categoryId: categoryId }
        });
        res.json(material);
    } catch (error){
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not update material.' });
    } 
});

// Create new material
router.post('/', async (req, res) => {
    try{
        const { name, unit, pricePerUnit, quantity, categoryId, userId } = req.body;

        const errors = [
            validateString(name, { fieldName: 'name', required: true, maxLength: 100}),
            validateString(unit, { fieldName: 'unit', required: true, maxLength: 50}),
            validateDecimalString(pricePerUnit, { fieldName: 'pricePerUnit', required: true, maxDecimalPlaces: 2}),
            validateDecimalString(quantity, { fieldName: 'quantity', required: true, maxDecimalPlaces: 2}),
            validatePositiveInteger(categoryId, { fieldName: 'categoryId', required: true}),
            validatePositiveInteger(userId, { fieldName: 'userId', required: true})
        ].filter(Boolean);

        if(errors.length) return res.status(400).json({ errors });

        const createMaterial = await prisma.material.create({
            data: {
                name, categoryId, unit, pricePerUnit, quantity, userId
            }
        });
        res.status(201).json(createMaterial);
    } catch (error) {
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not create material.' });
    }
    
});

export default router;