import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../app.js';
import prisma from '../prisma.js';
import resetDatabase from './tests/resetDatabase.js';
import jwt from 'jsonwebtoken';

const validUser = { username: 'danielle', password: 'password' };

describe('POST /users', () => {
    beforeEach(async () => {
        await resetDatabase();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    test('Creates a user and returns 201', async () => {
        const response = await request(app).post('/users').send(validUser);

        expect(response.status).toBe(201);
        expect(response.body.username).toBe('danielle');
        expect(response.body.id).toBeDefined();

        const users = await prisma.user.findMany();
        expect(users).toHaveLength(1);
        expect(users[0].username).toBe('danielle');
    });

    test('Stores a hash, not the plaintext password', async () => {
        await request(app).post('/users').send(validUser);

        const users = await prisma.user.findMany();
        expect(users[0].passwordHash).not.toBe('correcthorse');

        const matches = await bcrypt.compare('password', users[0].passwordHash);
        expect(matches).toBe(true);
    });

    test('Response body contains only id and username', async () => {
        const response = await request(app).post('/users').send(validUser);

        expect(Object.keys(response.body).sort()).toEqual(['id', 'username']);
    });

    test('Rejects a duplicate username', async () => {
        await prisma.user.create({
            data: { username: 'danielle', passwordHash: 'alreadyhashed' }
        });

        const response = await request(app).post('/users').send(validUser);

        expect(response.status).toBe(400);

        const users = await prisma.user.findMany();
        expect(users).toHaveLength(1);
        expect(users[0].passwordHash).toBe('alreadyhashed');
    });

    test('Rejects a password below the minimum length', async () => {
        const response = await request(app)
            .post('/users')
            .send({ username: 'danielle', password: 'short' });

        expect(response.status).toBe(400);
        expect(response.body.errors).toBeDefined();
        expect(await prisma.user.findMany()).toHaveLength(0);
    });

    test('Rejects a username below the minimum length', async () => {
        const response = await request(app)
            .post('/users')
            .send({ username: 'abc', password: 'correcthorse' });

        expect(response.status).toBe(400);
        expect(response.body.errors).toBeDefined();
        expect(await prisma.user.findMany()).toHaveLength(0);
    });

    test('Rejects a missing username', async () => {
        const response = await request(app)
            .post('/users')
            .send({ password: 'correcthorse' });

        expect(response.status).toBe(400);
        expect(await prisma.user.findMany()).toHaveLength(0);
    });

    test('Rejects a missing password', async () => {
        const response = await request(app)
            .post('/users')
            .send({ username: 'danielle' });

        expect(response.status).toBe(400);
        expect(await prisma.user.findMany()).toHaveLength(0);
    });

    test('Rejects an empty body', async () => {
        const response = await request(app).post('/users').send({});

        expect(response.status).toBe(400);
        expect(await prisma.user.findMany()).toHaveLength(0);
    });
});