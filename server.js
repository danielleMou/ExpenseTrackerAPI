import prisma from './prisma.js';
import express from 'express';

const app = express();
const port = 3000;

app.use(express.json());

import materialsRouter from './routes/materials.js';
app.use('/materials', materialsRouter);

import categoriesRouter from './routes/categories.js';
app.use('/categories', categoriesRouter);

import expensesRouter from './routes/expenses.js';
app.use('/expenses', expensesRouter);

import moneyInRouter from './routes/moneyIn.js';
app.use('/moneyIn', moneyInRouter);

import finishedObjectRouter from './routes/finishedObjects.js';
app.use('/finishedObjects', finishedObjectRouter);

import logRouter from './routes/logs.js';
app.use('/logs', logRouter);


app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});