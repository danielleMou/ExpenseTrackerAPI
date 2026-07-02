import prisma from "../prisma.js";
import express from "express";

const router = express.Router();

// Get all materials
router.get('/', async (req, res) => {
    const materials = await prisma.material.findMany();
    res.json(materials);
});

// Get material by id
router.get('/:id', async (req, res) => {
    try{
        const id = parseInt(req.params.id);
        const material = await prisma.material.findUnique({
            where: { id: id },
        }) 
        if(!material){
            return res.status(404).json({ error: "Material does not exist." });
        }
        res.json(material);
    } catch (error) {
        res.status(500).json({ error: "Could not get material." });
    } 
});

// Update a specific (NON-QUANTITY) field.
// partial update works because Prisma treats undefined fields as skip
router.patch('/:id', async (req, res) => {
    try{
        const { name, unit, pricePerUnit, categoryId } = req.body;
        const id = parseInt(req.params.id);
        const material = await prisma.material.update({
            where: { id: id },
            data: { name: name, pricePerUnit: pricePerUnit, unit: unit, categoryId: categoryId }
        });
        res.json(material);
    } catch (error){
        res.status(500).json({ error: "Could not update material." });
    }    
});

// Create new material
router.post('/', async (req, res) => {
    const { name, unit, pricePerUnit, quantity, categoryId, userId } = req.body;
    try{
        const createMaterial = await prisma.material.create({
            data: {
                name, categoryId, unit, pricePerUnit, quantity, userId
            }
        });
        res.status(201).json(createMaterial);
    } catch (error) {
        res.status(500).json({ error: "Could not create material."});
    }
    
});

export default router;