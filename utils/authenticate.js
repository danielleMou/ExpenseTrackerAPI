import express from "express";
import jwt from 'jsonwebtoken';

export default function authenticate(req, res, next){
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not authenticated.' });
    }

    // get the token
    const token = header.split(' ')[1];

    // verify the token
    try{
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = { id: payload.userId };
        next();

    } catch (error) {
        return res.status(401).json({ error: 'Not authenticated.' });
    }
}