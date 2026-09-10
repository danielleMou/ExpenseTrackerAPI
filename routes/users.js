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

        const errors = [
            validateString(username, { fieldName: 'username', required: true, maxLength: 20, minLength: 5}),
            validateString(password, { fieldName: 'password', required: true, maxLength: 50, minLength: 8})
        ].filter(Boolean);

        if(errors.length) return res.status(400).json({ errors });

        // check the username doesnt already exist
        const userExists = await prisma.user.findUnique(
            { where: { username } }
        );

        if(userExists !== null){
            return res.status(400).json({ error: "Username already exists."});
        }

        const hash = await bcrypt.hash(password, 12);
        const newUser = await prisma.user.create({
                data: { username: username, passwordHash: hash },
                select: { id: true, username: true }
        });

        res.status(201).json(newUser);

    } catch (error) {
        console.log(error);
        if (handlePrismaError(error, res)) return;
        res.status(500).json({ error: 'Could not create user.' });
    } 
});

export default router;