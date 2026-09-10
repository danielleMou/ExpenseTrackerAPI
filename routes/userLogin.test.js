import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import prisma from '../prisma.js';
import resetDatabase from './tests/resetDatabase.js';

const PASSWORD = 'password';

async function makeUser(username = 'danielle') {
    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    return prisma.user.create({ data: { username, passwordHash } });
}

describe('POST /login', () => {
    beforeEach(async () => {
        await resetDatabase();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    test('Returns a token and the user for valid credentials', async () => {
        const user = await makeUser();

        const response = await request(app)
            .post('/login')
            .send({ username: 'danielle', password: PASSWORD });

        expect(response.status).toBe(200);
        expect(response.body.token).toBeDefined();
        expect(response.body.user.id).toBe(user.id);
        expect(response.body.user.username).toBe('danielle');
    });

    test('Issues a token carrying the user id', async () => {
        const user = await makeUser();

        const response = await request(app)
            .post('/login')
            .send({ username: 'danielle', password: PASSWORD });

        const payload = jwt.verify(response.body.token, process.env.JWT_SECRET);
        expect(payload.userId).toBe(user.id);
        expect(payload.exp).toBeDefined();
    });

    test('Response never contains the password hash', async () => {
        await makeUser();

        const response = await request(app)
            .post('/login')
            .send({ username: 'danielle', password: PASSWORD });

        expect(Object.keys(response.body.user).sort()).toEqual(['id', 'username']);
        expect(JSON.stringify(response.body)).not.toContain('$2b$');
    });

    test('Rejects a wrong password with 401 and no token', async () => {
        await makeUser();

        const response = await request(app)
            .post('/login')
            .send({ username: 'danielle', password: 'wrongpassword' });

        expect(response.status).toBe(401);
        expect(response.body.token).toBeUndefined();
    });

    test('Rejects an unknown username with 401 and no token', async () => {
        await makeUser();

        const response = await request(app)
            .post('/login')
            .send({ username: 'nobody', password: PASSWORD });

        expect(response.status).toBe(401);
        expect(response.body.token).toBeUndefined();
    });

    test('Wrong password and unknown username are indistinguishable', async () => {
        await makeUser();

        const wrongPassword = await request(app)
            .post('/login')
            .send({ username: 'danielle', password: 'wrongpassword' });

        const unknownUser = await request(app)
            .post('/login')
            .send({ username: 'nobody', password: PASSWORD });

        expect(unknownUser.status).toBe(wrongPassword.status);
        expect(unknownUser.body).toEqual(wrongPassword.body);
    });

    test('Rejects a missing username with 400', async () => {
        await makeUser();

        const response = await request(app).post('/login').send({ password: PASSWORD });

        expect(response.status).toBe(400);
        expect(response.body.token).toBeUndefined();
    });

    test('Rejects a missing password with 400', async () => {
        await makeUser();

        const response = await request(app).post('/login').send({ username: 'danielle' });

        expect(response.status).toBe(400);
        expect(response.body.token).toBeUndefined();
    });

    test('Rejects an empty body with 400', async () => {
        await makeUser();

        const response = await request(app).post('/login').send({});

        expect(response.status).toBe(400);
        expect(response.body.token).toBeUndefined();
    });
});