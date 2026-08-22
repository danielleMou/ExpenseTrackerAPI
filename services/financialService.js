import prisma from "../prisma.js";
import { Decimal } from '@prisma/client/runtime/library';

async function createExpense(name, cost, materialId, description, userId){
    const expense = prisma.$transaction(async (tx) => {
        // create the expense in the expense table
        const createExpense = await tx.expense.create({
            data: {
                name, cost, materialId, description, userId
            }
        });

        // create the financial log - expense created
        const f = await tx.financialLog.create({
            data: { 
                action: `Created new expense.`, type: "expense", amount: cost, userId: userId 
            }
        });
        return createExpense;
    });
    return expense;
}

async function editExpense(id, name, cost, description){
    const expense = prisma.$transaction(async (tx) => {
        // edit the expense
        const editExpense = await tx.expense.update({
            where: {id: id},
            data: { name, cost, description }
        });

        // create the financial log
        const f = await tx.financialLog.create({
            data: { 
                action: `Edited expense.`, type: "expense", amount: cost, userId: userId 
            }
        });
        return editExpense;
    });
    return expense;
}

async function deleteExpense(){
    
}

async function createMoneyIn(name, amount, description, userId, finishedObjectId){
    const moneyIn = prisma.$transaction(async (tx) => {
        // create the money in record in the table
        const createMoneyIn = await tx.moneyIn.create({
            data: {
                name, amount, description, userId, finishedObjectId
            }
        });

        // create the log
        const f = await tx.financialLog.create({
            data: { 
                action: `Created money in.`, type: "money in", amount, userId: userId 
            }
        });
        return moneyIn;
    });
    return moneyIn;
}

async function editMoneyIn(id, name, amount, description){
    const moneyIn = prisma.$transaction(async (tx) => {
        // edit the money in record in the table
        const moneyin = await tx.moneyIn.update({
            where: {id: id},
            data: { name, amount, description }
        });

        // create the financial log
        const f = await tx.financialLog.create({
            data: { 
                action: `Edited money in.`, type: "money in", amount, userId: userId 
            }
        });
        return moneyIn;
    });
    return moneyIn;
}

async function deleteMoneyIn(){

}

export { createExpense, editExpense, deleteExpense, createMoneyIn, editMoneyIn, deleteMoneyIn }