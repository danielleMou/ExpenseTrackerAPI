import prisma from "../prisma.js";
import { Decimal } from '@prisma/client/runtime/library';

async function createExpense(name, cost, materialId, description, userId){
    const expense = await prisma.$transaction(async (tx) => {
        // check the material id exists and belongs to the user
        if(materialId !== null){
            const fetchedMaterial = await tx.material.findUnique( { where: { id: materialId, userId }} );
            if(fetchedMaterial == null) {
                const err = new Error(`Material with id ${materialId} does not exist.`);
                err.code = 'MATERIAL_NONEXISTENT';
                throw err;
            }
        }

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

async function editExpense(id, name, cost, description, userId){
    const expense = await prisma.$transaction(async (tx) => {
        // check the id exists and belongs to the user
        const fetchedExpense = await tx.expense.findFirst( { where: { id, userId }} );
            if(fetchedExpense == null) {
                const err = new Error(`Expense with id ${id} does not exist.`);
                err.code = 'EXPENSE_NONEXISTENT';
                throw err;
        }

        // edit the expense
        const editExpense = await tx.expense.update({
            where: {id: id},
            data: { name, cost, description }
        });

        const updatedRowCost = editExpense.cost;

        // create the financial log
        const f = await tx.financialLog.create({
            data: { 
                action: `Edited expense.`, type: "expense", amount: updatedRowCost, userId: userId 
            }
        });
        return editExpense;
    });
    return expense;
}

async function deleteExpense(id, userId){
    const deleteEx = await prisma.$transaction(async (tx) => {
        // check the id exists and belongs to user
        const fetchedExpense = await tx.expense.findFirst( { where: { id, userId }} );
            if(fetchedExpense == null) {
                const err = new Error(`Expense with id ${id} does not exist.`);
                err.code = 'EXPENSE_NONEXISTENT';
                throw err;
        }

        // if exists then delete record
        const deleted = await tx.expense.delete({
            where: {
                id: id,
            },
        });

        // create the delete log
        const f = await tx.financialLog.create({
            data: { 
                action: `Deleted expense ${id}.`, type: "expense", amount: fetchedExpense.cost, userId: userId 
            }
        });
        return deleted;
    })
    return deleteEx;   
}

async function createMoneyIn(name, amount, description, userId, FOId){
    const moneyIn = await prisma.$transaction(async (tx) => {
        if(FOId !== null){
            // check the foid exists and belongs to the user
            const fo = await tx.finishedObject.findFirst( { where: { id: FOId, userId }} );
            if(fo == null) {
                const err = new Error(`Finished object with id ${FOId} does not exist.`);
                err.code = 'FO_NONEXISTENT';
                throw err;
            }
        }
        

        // create the money in record in the table
        const createMoneyIn = await tx.moneyIn.create({
            data: {
                name, amount, description, userId, FOId
            }
        });

        // create the log
        const f = await tx.financialLog.create({
            data: { 
                action: `Created money in.`, type: "money in", amount, userId: userId 
            }
        });
        return createMoneyIn;
    });
    return moneyIn;
}

async function editMoneyIn(id, name, amount, description, userId){
    const moneyInEdit = await prisma.$transaction(async (tx) => {
        const fetchedMoneyIn = await tx.moneyIn.findFirst( { where: { id, userId }} );
        if(fetchedMoneyIn == null) {
            const err = new Error(`Money in with id ${id} does not exist.`);
            err.code = 'MONEY_IN_NONEXISTENT';
            throw err;
        }

        // edit the money in record in the table
        const moneyIn = await tx.moneyIn.update({
            where: {id: id},
            data: { name, amount, description }
        });

        const updatedRowCost = moneyIn.amount;

        // create the financial log
        const f = await tx.financialLog.create({
            data: { 
                action: `Edited money in.`, type: "money in", amount: updatedRowCost, userId: userId 
            }
        });
        return moneyIn;
    });
    return moneyInEdit;
}

async function deleteMoneyIn(id, userId){
    const deleteMoneyIn = await prisma.$transaction(async (tx) => {
        // check the id exists
        const fetchedMoneyIn = await tx.moneyIn.findFirst( { where: { id, userId }} );
            if(fetchedMoneyIn == null) {
                const err = new Error(`Money in with id ${id} does not exist.`);
                err.code = 'MONEY_IN_NONEXISTENT';
                throw err;
        }

        // if exists then delete record
        const deleted = await tx.moneyIn.delete({
            where: {
                id: id,
            },
        });

        // create the delete log
        const f = await tx.financialLog.create({
            data: { 
                action: `Deleted money in record ${id}.`, type: "money in", amount: fetchedMoneyIn.amount, userId: userId 
            }
        });
        return deleted;
    })
    return deleteMoneyIn; 
}

export { createExpense, editExpense, deleteExpense, createMoneyIn, editMoneyIn, deleteMoneyIn }