import prisma from "../prisma.js";
import express from "express";
import parseId from "../utils/parseId.js";
import {validateString, validateDecimalString, validatePositiveInteger} from "../utils/validators.js";
import handlePrismaError from "../utils/prismaErrorHandler.js";

const router = express.Router();

// Create a new category
router.post('/', async (req, res) => {
    try{
        const userId = req.user.id;

        const { name, type} = req.body;

        const errors = [
            validateString(name, { fieldName: 'name', required: true, maxLength: 100}),
            validateString(type, { fieldName: 'type', required: true, maxLength: 10})
        ].filter(Boolean);

        if(errors.length) return res.status(400).json({ errors });

        const createCategory = await prisma.category.create({
            data: {
                name, type, userId
            }
        });
        res.status(201).json(createCategory);
    } catch (error){
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not create category.' });
    }
});

// Edit category
router.patch('/:id', async (req, res) => {
    try{
        const userId = req.user.id;

        const id = parseId(req.params.id)
        if (id == null) return res.status(400).json({ error: "Id must be a positive integer" });

        const name = req.body.name;
        if(name === undefined) return res.status(400).json({ error: "Must have at least one field to patch." });

        const errors = [validateString(name, { fieldName: 'name', required: false, maxLength: 100 })].filter(Boolean);
        if (errors.length) return res.status(400).json({ errors });

        const category = await prisma.category.update({
            where: {id, userId},
            data: {name: name}
        });

        if(category == null) return res.status(404).json({ error: "Category does not exist." });
        
        res.json(category)
    } catch (error){
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not update category.' });
    }
})

// Get all categories
router.get('/', async (req, res) => {
    try{
        const userId = req.user.id;

        const categories = await prisma.category.findMany({ where: { userId }});
        res.json(categories);
    } catch (error){
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not get all categories.' });
    }
    
});

// Get by id
router.get('/:id', async (req, res) => {
    try{
        const userId = req.user.id;

        const id = parseId(req.params.id)
        if (id == null) return res.status(400).json({ error: "Id must be a positive integer" });

        const category = await prisma.category.findFirst({
            where: { id, userId },
        }) 
        if(!category){
            return res.status(404).json({ error: "Category does not exist." });
        }
        res.json(category);
    } catch (error) {
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not get category.' });
    } 
});

export default router;