const express = require('express');
const app = express();
const port = 3000;

const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

app.use(express.json());

// Get all materials
app.get('/materials', async (req, res) => {
    const materials = await prisma.material.findMany();
    res.json(materials);
});

// Get material by id
app.get('/materials/:id', async (req, res) => {
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
app.patch('/materials/:id', async (req, res) => {
    try{
       const { name, unit, pricePerUnit } = req.body;
        const id = parseInt(req.params.id);
        const material = await prisma.material.update({
            where: { id: id },
            data: { name: name, pricePerUnit: pricePerUnit, unit: unit}
        });
        res.json(material);
    } catch (error){
        res.status(500).json({ error: "Could not update material." });
    }    
});

// Create new material
app.post('/materials', async (req, res) => {
    const { name, unit, pricePerUnit, quantity, categoryId, userId } = req.body;
    try{
        const createMaterial = await prisma.material.create({
            data: {
                name, categoryId, unit, pricePerUnit, quantity, userId
            }
        })
        res.status(201).json(createMaterial);
    } catch (error) {
        res.status(500).json({ error: "Could not create material."});
    }
    
});

app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});