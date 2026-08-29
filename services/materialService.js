import prisma from "../prisma.js";
import { Decimal } from '@prisma/client/runtime/library';

async function createMaterial(name, unit, pricePerUnit, quantity, categoryId, createExpense, userId){
    const create = await prisma.$transaction(async (tx) => {
        // create the new material
        const createNewMaterial = await tx.material.create({
            data: {
                name, categoryId, unit, pricePerUnit, quantity, userId
            }
        });

        // create an expense and log if user chooses to and the quanity is greater than 0
        if(createExpense && new Decimal(quantity).gt(0)){
            const expenseName = `Create new material ${createNewMaterial.id}.`;
            const cost = (new Decimal(quantity)).mul(new Decimal(pricePerUnit)).toDecimalPlaces(2);
            const description = `Create new material ${createNewMaterial.id} with an amount of ${quantity} units.`
            const expense = await tx.expense.create({
                data: {
                    name: expenseName, cost, materialId: createNewMaterial.id, description, userId
                }
            });

            const f = await tx.financialLog.create({
                data: { 
                    action: `Create material ${createNewMaterial.id} with ${quantity} units.`, type: "expense", amount: cost, userId: userId 
                }
            });
        }

        const m = await tx.stockLog.create({
                data: { 
                    action: `Created material ${createNewMaterial.id} with ${quantity} units with price of £${pricePerUnit}`, materialId: createNewMaterial.id, userId: userId 
                }
        });

        return createNewMaterial;
    });

    return create;
}

// update a non-quanitiy field
async function updateMaterial(id, name, unit, pricePerUnit, categoryId, userId){
    
    const updatedMaterial = await prisma.$transaction( async (tx) =>{
        // check the material id exists
        const fetchedMaterial = await tx.material.findUnique( { where: { id: id }} );
        if(fetchedMaterial == null) {
            const err = new Error(`Material with id ${id} does not exist.`);
            err.code = 'MATERIAL_NONEXISTENT';
            throw err;
        }

        // update the material
        const material = await tx.material.update({
            where: { id: id },
            data: { name, pricePerUnit, unit, categoryId }
        });

        const updatedFields = [];
        if(name !== undefined) updatedFields.push(`name: ${name}`);
        if(unit !== undefined) updatedFields.push(`unit: ${unit}`);
        if(pricePerUnit !== undefined) updatedFields.push(`pricePerUnit: ${pricePerUnit}`);
        if(categoryId !== undefined) updatedFields.push(`CategoryId: ${categoryId}`);
        const fields = updatedFields.join(", ");

        // write the log - material field has been updated
        const m = await tx.stockLog.create({
                data: { 
                    action: `Material ${id} field(s) updated: ${fields}`, materialId: id, userId: userId 
                }
        });
        return material;
    })
    return updatedMaterial;
}


async function restockMaterial(materialId, noUnits, pricePerUnit, isUpdated, userId){
    if(noUnits <= 0) {
        const err = new Error(`Number of units to restock must be greater than 0.`);
        err.code = 'RESTOCK_BY_0';
        throw err;
    }

    const restock = await prisma.$transaction(async (tx) => {
        // check the material exists
        const fetchedMaterial = await tx.material.findUnique( { where: { id: materialId }} );
        if(fetchedMaterial == null) {
            const err = new Error(`Material with id ${materialId} does not exist.`);
            err.code = 'MATERIAL_NONEXISTENT';
            throw err;
        }

        // check the flag
        let price = pricePerUnit;
        if(!isUpdated){
            price = fetchedMaterial.pricePerUnit;
        }

        // update the material stock
        const updatedMaterial = await tx.material.update({
            where: { id: materialId },
            data: { pricePerUnit: price, quantity: {increment: noUnits} }
        });
        // create new expense - always uses the price per unit of what was actually paid
        const expenseName = `Material ${fetchedMaterial.id} restock.`;
        const cost = (new Decimal(noUnits)).mul(new Decimal(pricePerUnit)).toDecimalPlaces(2);
        const description = `Material ${fetchedMaterial.id} restock of ${noUnits} units.`
        const createExpense = await tx.expense.create({
            data: {
                name: expenseName, cost, materialId: fetchedMaterial.id, description, userId
            }
        });

        // create the logs - new expense log and new stock log
        const m = await tx.stockLog.create({
                data: { 
                    action: `restocked material ${fetchedMaterial.id} by ${noUnits} units with price of £${pricePerUnit}`, materialId: fetchedMaterial.id, userId: userId 
                }
        });

        // only updated if the flag is set to update AND the prices are the different
        if(isUpdated && !((fetchedMaterial.pricePerUnit).eq(price))){
            const u = await tx.stockLog.create({
                data: { 
                    action: `updated material ${fetchedMaterial.id} with new price of £${pricePerUnit}`, materialId: fetchedMaterial.id, userId: userId 
                }
            });
        }

        const f = await tx.financialLog.create({
                data: { 
                    action: `Material ${fetchedMaterial.id} restock of ${noUnits} units.`, type: "expense", amount: cost, userId: userId 
                }
        });

        return updatedMaterial;
    });

    return restock;
}

export { restockMaterial, createMaterial, updateMaterial };