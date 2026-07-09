import {Prisma} from "@prisma/client";

function handlePrismaError(error, res){
    if(error instanceof Prisma.PrismaClientKnownRequestError){
        switch(error.code){
            case 'P2025':
                res.status(404).json({ error: "Record not found."});
                return true;

            case 'P2003':
                res.status(400).json({ error: "Foreign key constraint failed."});
                return true;

            case 'P2002': 
                res.status(400).json({ error: "Unique constraint failed."});
                return true;

            default:
                return false;
        }
    }
    return false;
}

export default handlePrismaError;