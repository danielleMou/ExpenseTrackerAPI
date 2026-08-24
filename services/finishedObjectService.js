import prisma from "../prisma.js";
import { Decimal } from '@prisma/client/runtime/library';

// materials of the form: [{materialId, quantityUsed}, ... ]
async function createFinishedObject(name, description, categoryId, askingPrice, userId, materials){
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

            if(fetchedMaterial.quantity.lt(material.quantityUsed)){
                // error there is not enough quantity
                const err = new Error(`Insufficient stock of material ${fetchedMaterial.id}.`);
                err.code = 'INSUFFICIENT_STOCK';
                throw err;
            }

            // calculate the production cost of the finished object - for each material: cost of unit x quantity used
            productionCost = productionCost.plus(new Decimal(material.quantityUsed).mul(fetchedMaterial.pricePerUnit));
        };
        productionCost = productionCost.toDecimalPlaces(2);

        const status = 'unlisted';
        const isProcessed = false;
        const createFO = await tx.finishedObject.create({
            data: {
                name, description, categoryId, askingPrice, status, isProcessed, userId, productionCost
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
        return createFO;
    });

    return finishedObject;
}

async function hideUnsoldFO(foId, userId){

    const deleteFO = await prisma.$transaction(async (tx) => {
        // check that the finsihed object exists
        const fo = await tx.finishedObject.findUnique( { where: { id: foId }} );
        if(fo == null) {
            const err = new Error(`Finished object with id ${foId} does not exist.`);
            err.code = 'FO_NONEXISTENT';
            throw err;
        }
        
        // check the flag is unsold
        if(fo.status == "sold"){
            const err = new Error(`Cannot delete sold finished object.`);
            err.code = 'FO_SOLD';
            throw err;
        }

        const delFo = await tx.finishedObject.update({
            where: {id: foId},
            data: { isDeleted: true }
        });

        // create FO log
        const m = await tx.FOlog.create({
                data: { 
                    action: `Deleted FO ${foId}` , FOId: fo.id, userId: userId 
                }
        });

        return delFo;

    });

    return deleteFO;
}

export  {createFinishedObject, hideUnsoldFO};