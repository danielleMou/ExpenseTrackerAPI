import prisma from "../prisma.js";
import { Decimal } from '@prisma/client/runtime/library';

// materials of the form: [{materialId, quantityUsed}, ... ]
async function createFinishedObject(name, categoryId, askingPrice, userId, materials){
    if (materials.length === 0) throw new Error("materials array cannot be empty.");

    const finishedObject = await prisma.$transaction(async (tx) => {
        // retrieve all relavent materials
        const materialIds = materials.map((x) => { return x.materialId }); // an array of required material ids
        const fetchedMaterials = await tx.material.findMany({ where: { id: { in: materialIds } } }); // array of material objects from the db

        // create a materials map for easy lookup
        const materialsMap = new Map();
        fetchedMaterials.forEach((material) => {materialsMap.set(material.id, material)});

        // check there is enough of each material and if the material exists
        let productionCost = new Decimal(0);
        for(const material of materials) {
            const fetchedMaterial = materialsMap.get(material.materialId);
            // Check material exists
            if(fetchedMaterial == null){
                // error
                const err = new Error(`Material with id ${material.materialId} does not exist.`);
                err.code = 'MATERIAL_NONEXISTENT';
                throw err;
            }

            if(fetchedMaterial.quantity < material.quantityUsed){
                // error there is not enough quantity
                const err = new Error(`Insufficient stock of material ${fetchedMaterial.id}.`);
                err.code = 'INSUFFICIENT_STOCK';
                throw err;
            }

            // calculate the production cost of the finihsed object - for each material: cost of unit x quantity used
            productionCost = productionCost.plus(new Decimal(material.quantityUsed).mul(fetchedMaterial.pricePerUnit));
        };

        const status = 'unlisted';
        const isProcessed = false;
        const createFO = await tx.finishedObject.create({
            data: {
                name, categoryId, askingPrice, status, isProcessed, userId, productionCost
            }
        });

        // create the quantity used rows and deduct the stock
        for(const material of materials) {
            const createQuantUsed = await tx.quantityUsed.create({
                data: {
                    FOId: createFO.id, materialId: material.materialId, quantity: material.quantityUsed 
                }
            });

            const materialUpdate = await tx.material.update({
                where: { id: material.materialId },
                data: { quantity: { decrement: material.quantityUsed } }
            });

            //create the material logs
            const action = `Deducted quantity of ${material.quantityUsed} from material ${material.materialId} for finished object ${createFO.id}`;
            const materialStockLog = await tx.stockLog.create({
                data: { 
                    action: action, materialId: material.materialId, userId: userId 
                }
            });

        };

        // create fo log
        const m = await tx.FOlog.create({
                data: { 
                    action: "Created new finished object", FOId: createFO.id, userId: userId 
                }
        });
        throw new Error('force rollback for testing');
        return createFO;
    });

    return finishedObject;
}

export default createFinishedObject;