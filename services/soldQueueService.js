import prisma from "../prisma.js";
import { Decimal } from '@prisma/client/runtime/library';

// expenses in the form of [{name, cost, description}, ... ]
async function processSoldFo(FOid, salePrice, expenses, userId){
    const processFo = await prisma.$transaction( async (tx) => {
        // check the finished object exists
        const fo = await tx.finishedObject.findUnique( { where: { id: FOid }} );
        if(fo == null) {
            const err = new Error(`Finished object with id ${FOid} does not exist.`);
            err.code = 'FO_NONEXISTENT';
            throw err;
        }

        // check the finished object isnt already sold, processed or deleted
        if(fo.status != "sold" || fo.isProcessed == true || fo.isDeleted == true){
            const err = new Error(`Finished object must not already be processed or deleted.`);
            err.code = 'FO_INVALID';
            throw err;
        }

        // mark fo as processed
        const updateStatus = await tx.finishedObject.update({
            where: { id: FOid },
            data: { isProcessed: true }
        });

        // create money in record
        const createMoneyIn = await tx.moneyIn.create({
            data: {
                name: `Sold FO`, amount: salePrice, description: `FO ${FOid} sold for a price of ${salePrice}`, userId, FOId: FOid
            }
        });

        // create the log
        const f = await tx.financialLog.create({
            data: { 
                action: `Sold FO ${FOid}.`, type: "money in", amount: salePrice, userId: userId 
            }
        });

        // check if the expense list is empty
        // if not empty then loop through and create the expenses and logs
        if(expenses.length > 0){
            for(const expense of expenses){
                // create expense
                const createExpense = await tx.expense.create({
                    data: {
                        name: expense.name , cost: expense.cost, description: expense.description , userId
                    }
                });

                // create the log
                const f = await tx.financialLog.create({
                    data: { 
                        action: `New expense created. ${expense.name}. Fees for FO ${FOid}.`, type: "expense", amount: expense.cost, userId: userId 
                    }
                });
            }
        }

        // create fo log
        const m = await tx.FOlog.create({
                data: { 
                    action: "Finished object processed", FOId: FOid, userId: userId 
                }
        });

        return updateStatus; 
    })
    return processFo;
}

export {processSoldFo};