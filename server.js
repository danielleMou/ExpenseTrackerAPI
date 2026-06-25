const express = require('express');
const app = express();
const port = 3000;

const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

app.get('/health', (req, res) => {
    res.json('{status: "ok"}');
});

app.get('/materials', async (req, res) => {
    const materials = await prisma.material.findMany();
    res.json(materials);
});

app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});