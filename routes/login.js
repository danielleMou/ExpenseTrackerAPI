import prisma from "../prisma.js";
import express from "express";
import parseId from "../utils/parseId.js";
import {validateString, validateDecimalString, validatePositiveInteger} from "../utils/validators.js";
import handlePrismaError from "../utils/prismaErrorHandler.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const router = express.Router();

router.post('/', async (req, res) => {
    try{
        const { username, password } = req.body;

        if (username == null || password == null) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        // look up user and check password
        const user = await prisma.user.findUnique(
            { where: { username } }
        );

        if(user === null){
            return res.status(401).json({ error: "Incorrect Credentials."});
        }

        const match = await bcrypt.compare(password, user.passwordHash);
        if(!match){
            return res.status(401).json({ error: "Incorrect Credentials."});
        }

        // create token
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.status(200).json({ token, user: { id: user.id, username: user.username } }); 

    } catch (error) {
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not login.' });
    }
});

export default router;