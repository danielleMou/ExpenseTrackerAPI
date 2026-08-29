import express from 'express';
import materialsRouter from './routes/materials.js';
import categoriesRouter from './routes/categories.js';
import expensesRouter from './routes/expenses.js';
import moneyInRouter from './routes/moneyIn.js';
import finishedObjectRouter from './routes/finishedObjects.js';
import logRouter from './routes/logs.js';

const app = express();

app.use(express.json());

app.use('/materials', materialsRouter);
app.use('/categories', categoriesRouter);
app.use('/expenses', expensesRouter);
app.use('/moneyIn', moneyInRouter);
app.use('/finishedObjects', finishedObjectRouter);
app.use('/logs', logRouter);

export default app;