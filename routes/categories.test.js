import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import prisma from '../prisma.js';
import resetDatabase from './tests/resetDatabase.js';

async function makeAuthedUser(username = 'danielle') {
  const user = await prisma.user.create({
    data: { username, passwordHash: 'unused' }
  });
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
  return { user, token };
}

async function makeCategory(userId, overrides = {}) {
  return prisma.category.create({
    data: { name: 'Fabric', type: 'material', userId, ...overrides }
  });
}

const auth = (token) => `Bearer ${token}`;

describe('Authentication on /categories', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('401s without an Authorization header', async () => {
    const res = await request(app).get('/categories');
    expect(res.status).toBe(401);
  });

  test('401s for a malformed Authorization header', async () => {
    const res = await request(app).get('/categories').set('Authorization', 'nonsense');
    expect(res.status).toBe(401);
  });

  test('401s for a token signed with the wrong secret', async () => {
    const token = jwt.sign({ userId: 1 }, 'wrong-secret');
    const res = await request(app).get('/categories').set('Authorization', auth(token));
    expect(res.status).toBe(401);
  });

  test('401s for an expired token', async () => {
    const { user } = await makeAuthedUser('user 1');
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '-1s' });

    const res = await request(app).get('/categories').set('Authorization', auth(token));
    expect(res.status).toBe(401);
  });

  test('401s on a write route without a token', async () => {
    const res = await request(app).post('/categories').send({ name: 'Fabric', type: 'material' });
    expect(res.status).toBe(401);
    expect(await prisma.category.findMany()).toHaveLength(0);
  });
});

describe('GET /categories', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns an empty array when there are none', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .get('/categories')
      .set('Authorization', auth(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns all categories', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    await makeCategory(user.id, { name: 'Fabric' });
    await makeCategory(user.id, { name: 'Bags', type: 'finishedObject' });

    const res = await request(app)
      .get('/categories')
      .set('Authorization', auth(token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((c) => c.name).sort()).toEqual(['Bags', 'Fabric']);
  });

  test('returns only the requesting user\'s categories', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    await makeCategory(userA.user.id, { name: 'Fabric' });
    await makeCategory(userB.user.id, { name: 'Thread' });

    const res = await request(app)
      .get('/categories')
      .set('Authorization', auth(userA.token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Fabric');
  });
});

describe('GET /categories/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns the category', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);

    const res = await request(app)
      .get(`/categories/${cat.id}`)
      .set('Authorization', auth(token));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(cat.id);
    expect(res.body.name).toBe('Fabric');
    expect(res.body.type).toBe('material');
  });

  test('404s for one that does not exist', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .get('/categories/999999')
      .set('Authorization', auth(token));

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('404s for another user\'s category', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const catB = await makeCategory(userB.user.id);

    const res = await request(app)
      .get(`/categories/${catB.id}`)
      .set('Authorization', auth(userA.token));

    expect(res.status).toBe(404);
  });

  test('400s for a non-numeric id', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .get('/categories/abc')
      .set('Authorization', auth(token));

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('400s for a zero id', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .get('/categories/0')
      .set('Authorization', auth(token));

    expect(res.status).toBe(400);
  });
});

describe('POST /categories', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('creates a category and returns 201', async () => {
    const { user, token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .post('/categories')
      .set('Authorization', auth(token))
      .send({ name: 'Fabric', type: 'material' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Fabric');
    expect(res.body.type).toBe('material');
    expect(res.body.userId).toBe(user.id);

    expect(await prisma.category.findMany()).toHaveLength(1);
  });

  test('records the category against the token\'s user, ignoring a userId in the body', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const res = await request(app)
      .post('/categories')
      .set('Authorization', auth(userA.token))
      .send({ name: 'Fabric', type: 'material', userId: userB.user.id });

    expect(res.status).toBe(201);

    const categories = await prisma.category.findMany();
    expect(categories).toHaveLength(1);
    expect(categories[0].userId).toBe(userA.user.id);
  });

  test('400s with an errors array when the body is empty', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .post('/categories')
      .set('Authorization', auth(token))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(await prisma.category.findMany()).toHaveLength(0);
  });

  test('400s for an empty name', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .post('/categories')
      .set('Authorization', auth(token))
      .send({ name: '', type: 'material' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('400s for a name over the length limit', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .post('/categories')
      .set('Authorization', auth(token))
      .send({ name: 'x'.repeat(101), type: 'material' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('400s for a type over the length limit', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .post('/categories')
      .set('Authorization', auth(token))
      .send({ name: 'Fabric', type: 'x'.repeat(11) });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });
});

describe('PATCH /categories/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('updates the name', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);

    const res = await request(app)
      .patch(`/categories/${cat.id}`)
      .set('Authorization', auth(token))
      .send({ name: 'Fabrics and Textiles' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Fabrics and Textiles');

    const updated = await prisma.category.findUnique({ where: { id: cat.id } });
    expect(updated.name).toBe('Fabrics and Textiles');
  });

  test('ignores type when it is sent', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id, { type: 'material' });

    const res = await request(app)
      .patch(`/categories/${cat.id}`)
      .set('Authorization', auth(token))
      .send({ name: 'Renamed', type: 'finishedObject' });

    expect(res.status).toBe(200);

    const updated = await prisma.category.findUnique({ where: { id: cat.id } });
    expect(updated.type).toBe('material');
    expect(updated.name).toBe('Renamed');
  });

  test('400s for an empty body', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);

    const res = await request(app)
      .patch(`/categories/${cat.id}`)
      .set('Authorization', auth(token))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('400s for a non-numeric id', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .patch('/categories/abc')
      .set('Authorization', auth(token))
      .send({ name: 'x' });

    expect(res.status).toBe(400);
  });

  test('404s for one that does not exist', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .patch('/categories/999999')
      .set('Authorization', auth(token))
      .send({ name: 'x' });

    expect(res.status).toBe(404);
  });

  test('404s when editing another user\'s category and leaves it untouched', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const catB = await makeCategory(userB.user.id, { name: 'Thread' });

    const res = await request(app)
      .patch(`/categories/${catB.id}`)
      .set('Authorization', auth(userA.token))
      .send({ name: 'Hijacked' });

    expect(res.status).toBe(404);

    const untouched = await prisma.category.findUnique({ where: { id: catB.id } });
    expect(untouched.name).toBe('Thread');
  });

  test('400s for an empty name', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);

    const res = await request(app)
      .patch(`/categories/${cat.id}`)
      .set('Authorization', auth(token))
      .send({ name: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('400s for a name over the length limit', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);

    const res = await request(app)
      .patch(`/categories/${cat.id}`)
      .set('Authorization', auth(token))
      .send({ name: 'x'.repeat(101) });

    expect(res.status).toBe(400);
  });

  test('does not affect other categories', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const a = await makeCategory(user.id, { name: 'Fabric' });
    const b = await makeCategory(user.id, { name: 'Thread' });

    await request(app)
      .patch(`/categories/${a.id}`)
      .set('Authorization', auth(token))
      .send({ name: 'Fabrics' });

    const untouched = await prisma.category.findUnique({ where: { id: b.id } });
    expect(untouched.name).toBe('Thread');
  });
});