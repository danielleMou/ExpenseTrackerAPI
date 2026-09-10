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

async function makeCategory(userId, name = 'Fabric', type = 'material') {
  return prisma.category.create({ data: { name, type, userId } });
}

async function makeMaterial(userId, categoryId, overrides = {}) {
  return prisma.material.create({
    data: {
      name: 'Cotton',
      unit: 'm',
      quantity: '10',
      pricePerUnit: '2.50',
      categoryId,
      userId,
      ...overrides
    }
  });
}

const auth = (token) => `Bearer ${token}`;

describe('Authentication on /materials', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('401s without an Authorization header', async () => {
    const res = await request(app).get('/materials');

    expect(res.status).toBe(401);
  });

  test('401s for a malformed Authorization header', async () => {
    const res = await request(app).get('/materials').set('Authorization', 'nonsense');

    expect(res.status).toBe(401);
  });

  test('401s for a token signed with the wrong secret', async () => {
    const token = jwt.sign({ userId: 1 }, 'wrong-secret');

    const res = await request(app).get('/materials').set('Authorization', auth(token));

    expect(res.status).toBe(401);
  });

  test('401s for an expired token', async () => {
    const { user } = await makeAuthedUser('user 1');
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );

    const res = await request(app).get('/materials').set('Authorization', auth(token));

    expect(res.status).toBe(401);
  });

  test('401s on a write route without a token', async () => {
    const res = await request(app).post('/materials').send({ name: 'Cotton' });

    expect(res.status).toBe(401);
    expect(await prisma.material.findMany()).toHaveLength(0);
  });
});

describe('GET /materials', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns an empty array when there are none', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app).get('/materials').set('Authorization', auth(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns all materials', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    await makeMaterial(user.id, cat.id, { name: 'Cotton' });
    await makeMaterial(user.id, cat.id, { name: 'Linen' });

    const res = await request(app).get('/materials').set('Authorization', auth(token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((m) => m.name).sort()).toEqual(['Cotton', 'Linen']);
  });

  test('returns only the requesting user\'s materials', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const catA = await makeCategory(userA.user.id);
    const catB = await makeCategory(userB.user.id);

    await makeMaterial(userA.user.id, catA.id, { name: 'Cotton' });
    await makeMaterial(userB.user.id, catB.id, { name: 'Linen' });

    const res = await request(app)
      .get('/materials')
      .set('Authorization', auth(userA.token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Cotton');
  });
});

describe('GET /materials/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns the material', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    const res = await request(app)
      .get(`/materials/${mat.id}`)
      .set('Authorization', auth(token));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(mat.id);
    expect(res.body.name).toBe('Cotton');
  });

  test('404s for a material that does not exist', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .get('/materials/999999')
      .set('Authorization', auth(token));

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('404s for another user\'s material', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const catB = await makeCategory(userB.user.id);
    const matB = await makeMaterial(userB.user.id, catB.id);

    const res = await request(app)
      .get(`/materials/${matB.id}`)
      .set('Authorization', auth(userA.token));

    expect(res.status).toBe(404);
  });

  test('400s for a non-numeric id', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .get('/materials/abc')
      .set('Authorization', auth(token));

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('400s for a zero id', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .get('/materials/0')
      .set('Authorization', auth(token));

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /materials', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('creates a material and returns it', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);

    const res = await request(app)
      .post('/materials')
      .set('Authorization', auth(token))
      .send({
        name: 'Cotton',
        unit: 'm',
        pricePerUnit: '2.50',
        quantity: '10',
        categoryId: cat.id,
        createExpense: true
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Cotton');

    const materials = await prisma.material.findMany();
    expect(materials).toHaveLength(1);
    expect(materials[0].userId).toBe(user.id);
    expect(await prisma.expense.findMany()).toHaveLength(1);
  });

  test('ignores a userId in the body and uses the token', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');
    const catA = await makeCategory(userA.user.id);

    const res = await request(app)
      .post('/materials')
      .set('Authorization', auth(userA.token))
      .send({
        name: 'Cotton',
        unit: 'm',
        pricePerUnit: '2.50',
        quantity: '10',
        categoryId: catA.id,
        createExpense: true,
        userId: userB.user.id
      });

    expect(res.status).toBe(201);

    const materials = await prisma.material.findMany();
    expect(materials).toHaveLength(1);
    expect(materials[0].userId).toBe(userA.user.id);
  });

  test('400s with an errors array when required fields are missing', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .post('/materials')
      .set('Authorization', auth(token))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);

    expect(await prisma.material.findMany()).toHaveLength(0);
  });

  test('400s for an invalid decimal string', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);

    const res = await request(app)
      .post('/materials')
      .set('Authorization', auth(token))
      .send({
        name: 'Cotton',
        unit: 'm',
        pricePerUnit: '2.505',
        quantity: '10',
        categoryId: cat.id,
        createExpense: true
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('400s for a nonexistent category', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .post('/materials')
      .set('Authorization', auth(token))
      .send({
        name: 'Cotton',
        unit: 'm',
        pricePerUnit: '2.50',
        quantity: '10',
        categoryId: 999999,
        createExpense: true
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('rejects a category belonging to another user', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');
    const catB = await makeCategory(userB.user.id);

    const res = await request(app)
      .post('/materials')
      .set('Authorization', auth(userA.token))
      .send({
        name: 'Cotton',
        unit: 'm',
        pricePerUnit: '2.50',
        quantity: '10',
        categoryId: catB.id,
        createExpense: true
      });

    expect(res.status).toBe(400);
    expect(await prisma.material.findMany()).toHaveLength(0);
  });
});

describe('PATCH /materials/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('updates a field and returns the updated material', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    const res = await request(app)
      .patch(`/materials/${mat.id}`)
      .set('Authorization', auth(token))
      .send({ name: 'Organic Cotton' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Organic Cotton');

    expect(await prisma.stockLog.findMany()).toHaveLength(1);
  });

  test('400s for an empty body', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    const res = await request(app)
      .patch(`/materials/${mat.id}`)
      .set('Authorization', auth(token))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(await prisma.stockLog.findMany()).toHaveLength(0);
  });

  test('400s for a non-numeric id', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .patch('/materials/abc')
      .set('Authorization', auth(token))
      .send({ name: 'x' });

    expect(res.status).toBe(400);
  });

  test('404s for a material that does not exist', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .patch('/materials/999999')
      .set('Authorization', auth(token))
      .send({ name: 'x' });

    expect(res.status).toBe(404);
  });

  test('404s when editing another user\'s material and leaves it untouched', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const catB = await makeCategory(userB.user.id);
    const matB = await makeMaterial(userB.user.id, catB.id);

    const res = await request(app)
      .patch(`/materials/${matB.id}`)
      .set('Authorization', auth(userA.token))
      .send({ name: 'Hijacked' });

    expect(res.status).toBe(404);

    const untouched = await prisma.material.findUnique({ where: { id: matB.id } });
    expect(untouched.name).toBe('Cotton');
    expect(await prisma.stockLog.findMany()).toHaveLength(0);
  });

  test('400s for an invalid field value', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    const res = await request(app)
      .patch(`/materials/${mat.id}`)
      .set('Authorization', auth(token))
      .send({ name: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('404s when patching to another user\'s category', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const catA = await makeCategory(userA.user.id);
    const catB = await makeCategory(userB.user.id);
    const mat = await makeMaterial(userA.user.id, catA.id);

    const res = await request(app)
      .patch(`/materials/${mat.id}`)
      .set('Authorization', auth(userA.token))
      .send({ categoryId: catB.id });

    expect(res.status).toBe(400);

    const untouched = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(untouched.categoryId).toBe(catA.id);
    expect(await prisma.stockLog.findMany()).toHaveLength(0);
  });
});

describe('POST /materials/:id/restock', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('restocks and returns the updated material', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id, { quantity: '10' });

    const res = await request(app)
      .post(`/materials/${mat.id}/restock`)
      .set('Authorization', auth(token))
      .send({
        noUnits: '5',
        pricePerUnit: '2.50',
        isUpdated: false
      });

    expect(res.status).toBe(200);

    const updated = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(updated.quantity.toString()).toBe('15');
    expect(await prisma.expense.findMany()).toHaveLength(1);
  });

  test('404s when the material does not exist', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .post('/materials/999999/restock')
      .set('Authorization', auth(token))
      .send({
        noUnits: '5',
        pricePerUnit: '2.50',
        isUpdated: false
      });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('404s when restocking another user\'s material and leaves stock untouched', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const catB = await makeCategory(userB.user.id);
    const matB = await makeMaterial(userB.user.id, catB.id, { quantity: '10' });

    const res = await request(app)
      .post(`/materials/${matB.id}/restock`)
      .set('Authorization', auth(userA.token))
      .send({
        noUnits: '5',
        pricePerUnit: '2.50',
        isUpdated: false
      });

    expect(res.status).toBe(404);

    const untouched = await prisma.material.findUnique({ where: { id: matB.id } });
    expect(untouched.quantity.toString()).toBe('10');
    expect(await prisma.expense.findMany()).toHaveLength(0);
  });

  test('400s when restocking by zero', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id, { quantity: '10' });

    const res = await request(app)
      .post(`/materials/${mat.id}/restock`)
      .set('Authorization', auth(token))
      .send({
        noUnits: '0',
        pricePerUnit: '2.50',
        isUpdated: false
      });

    expect(res.status).toBe(400);

    const untouched = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(untouched.quantity.toString()).toBe('10');
  });

  test('400s when required fields are missing', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    const res = await request(app)
      .post(`/materials/${mat.id}/restock`)
      .set('Authorization', auth(token))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(await prisma.expense.findMany()).toHaveLength(0);
  });

  test('400s for a non-numeric id', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .post('/materials/abc/restock')
      .set('Authorization', auth(token))
      .send({ noUnits: '5', pricePerUnit: '2.50', isUpdated: false });

    expect(res.status).toBe(400);
  });

  
});