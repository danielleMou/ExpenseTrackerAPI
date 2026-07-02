import prisma from "../prisma.js";
import express from "express";

const router = express.Router();

// Finsihed objects - view all
router.get('/', async (req, res) => {
    const fos = await prisma.finishedObject.findMany();
    res.json(fos);
});

// Finished object - update attributes
router.patch('/:id', async (req, res) => {
    try{
        const {name, description, askingPrice, status} = req.body;
        const id = parseInt(req.params.id);
        const fo = await prisma.finishedObject.update({
            where: {id: id},
            data: { name, description, askingPrice, status }
        });
        res.json(fo);
    } catch (error){
        res.status(500).json({ error: "Could not update FO attributes." });
        console.log(error);
    }
})

export default router;