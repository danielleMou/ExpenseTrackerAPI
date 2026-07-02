import prisma from "../prisma.js";
import express from "express";

const router = express.Router();

// Create a new category
router.post('/', async (req, res) => {
    const { name, type, userId } = req.body;
    try{
        const createCategory = await prisma.category.create({
            data: {
                name, type, userId
            }
        });
        res.status(201).json(createCategory);
    } catch (error){
        res.status(500).json({ error: "Could not create category."});
        console.log(error);
    }
});

// Edit category
router.patch('/:id', async (req, res) => {
    try{
        const name = req.body.name;
        const id = parseInt(req.params.id);
        const category = await prisma.category.update({
            where: {id: id},
            data: {name: name}
        });
        res.json(category)
    } catch (error){
        res.status(500).json({ error: "Could not update category." });
        console.log(error);
    }
})

// Get all categories
router.get('/', async (req, res) => {
    const categories = await prisma.category.findMany();
    res.json(categories);
});

export default router;