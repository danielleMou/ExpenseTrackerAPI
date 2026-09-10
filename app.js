import express from 'express';
import materialsRouter from './routes/materials.js';
import categoriesRouter from './routes/categories.js';
import expensesRouter from './routes/expenses.js';
import moneyInRouter from './routes/moneyIn.js';
import finishedObjectRouter from './routes/finishedObjects.js';
import logRouter from './routes/logs.js';
import userRouter from './routes/users.js';
import loginRouter from './routes/login.js';
import authenticate from './utils/authenticate.js';

const app = express();

app.use(express.json());

app.use('/materials', authenticate, materialsRouter);
app.use('/categories', authenticate, categoriesRouter);
app.use('/expenses', authenticate, expensesRouter);
app.use('/moneyIn', authenticate, moneyInRouter);
app.use('/finishedObjects', authenticate, finishedObjectRouter);
app.use('/logs', authenticate, logRouter);
app.use('/users', userRouter);
app.use('/login', loginRouter);

export default app;