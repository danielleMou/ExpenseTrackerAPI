import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import prisma from '../prisma.js';
import resetDatabase from './tests/resetDatabase.js';

async function makeUser() {
  return prisma.user.create({ data: { username: 'user', password: 'pass' } });
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

describe('GET /materials', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns an empty array when there are none', async () => {
    const res = await request(app).get('/materials');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns all materials', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    await makeMaterial(user.id, cat.id, { name: 'Cotton' });
    await makeMaterial(user.id, cat.id, { name: 'Linen' });

    const res = await request(app).get('/materials');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((m) => m.name).sort()).toEqual(['Cotton', 'Linen']);
  });
});

describe('GET /materials/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns the material', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    const res = await request(app).get(`/materials/${mat.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(mat.id);
    expect(res.body.name).toBe('Cotton');
  });

  test('404s for a material that does not exist', async () => {
    const res = await request(app).get('/materials/999999');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('400s for a non-numeric id', async () => {
    const res = await request(app).get('/materials/abc');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('400s for a zero id', async () => {
    const res = await request(app).get('/materials/0');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /materials', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('creates a material and returns it', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);

    const res = await request(app)
      .post('/materials')
      .send({
        name: 'Cotton',
        unit: 'm',
        pricePerUnit: '2.50',
        quantity: '10',
        categoryId: cat.id,
        createExpense: true,
        userId: user.id
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Cotton');

    const materials = await prisma.material.findMany();
    expect(materials).toHaveLength(1);
    expect(await prisma.expense.findMany()).toHaveLength(1);
  });

  test('400s with an errors array when required fields are missing', async () => {
    const res = await request(app).post('/materials').send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);

    expect(await prisma.material.findMany()).toHaveLength(0);
  });

  test('400s for an invalid decimal string', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);

    const res = await request(app)
      .post('/materials')
      .send({
        name: 'Cotton',
        unit: 'm',
        pricePerUnit: '2.505',
        quantity: '10',
        categoryId: cat.id,
        createExpense: true,
        userId: user.id
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('400s for a nonexistent category via P2003', async () => {
    const user = await makeUser();

    const res = await request(app)
      .post('/materials')
      .send({
        name: 'Cotton',
        unit: 'm',
        pricePerUnit: '2.50',
        quantity: '10',
        categoryId: 999999,
        createExpense: true,
        userId: user.id
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('PATCH /materials/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('updates a field and returns the updated material', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    const res = await request(app)
      .patch(`/materials/${mat.id}`)
      .send({ name: 'Organic Cotton', userId: user.id });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Organic Cotton');

    expect(await prisma.stockLog.findMany()).toHaveLength(1);
  });

  test('400s for an empty body', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    const res = await request(app).patch(`/materials/${mat.id}`).send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(await prisma.stockLog.findMany()).toHaveLength(0);
  });

  test('400s for a non-numeric id', async () => {
    const res = await request(app).patch('/materials/abc').send({ name: 'x' });

    expect(res.status).toBe(400);
  });

  test('404s for a material that does not exist', async () => {
    const user = await makeUser();

    const res = await request(app)
      .patch('/materials/999999')
      .send({ name: 'x', userId: user.id });

    expect(res.status).toBe(404);
  });

  test('400s for an invalid field value', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    const res = await request(app)
      .patch(`/materials/${mat.id}`)
      .send({ name: '', userId: user.id });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });
});

describe('POST /materials/:id/restock', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('restocks and returns the updated material', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id, { quantity: '10' });

    const res = await request(app)
      .post(`/materials/${mat.id}/restock`)
      .send({
        noUnits: '5',
        pricePerUnit: '2.50',
        isUpdated: false,
        userId: user.id
      });

    expect(res.status).toBe(200);

    const updated = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(updated.quantity.toString()).toBe('15');
    expect(await prisma.expense.findMany()).toHaveLength(1);
  });

  test('404s when the material does not exist', async () => {
    const user = await makeUser();

    const res = await request(app)
      .post('/materials/999999/restock')
      .send({
        noUnits: '5',
        pricePerUnit: '2.50',
        isUpdated: false,
        userId: user.id
      });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('400s when restocking by zero', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id, { quantity: '10' });

    const res = await request(app)
      .post(`/materials/${mat.id}/restock`)
      .send({
        noUnits: '0',
        pricePerUnit: '2.50',
        isUpdated: false,
        userId: user.id
      });

    expect(res.status).toBe(400);

    const untouched = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(untouched.quantity.toString()).toBe('10');
  });

  test('400s when required fields are missing', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    const res = await request(app).post(`/materials/${mat.id}/restock`).send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(await prisma.expense.findMany()).toHaveLength(0);
  });

  test('400s for a non-numeric id', async () => {
    const res = await request(app)
      .post('/materials/abc/restock')
      .send({ noUnits: '5', pricePerUnit: '2.50', updateStoredPrice: false });

    expect(res.status).toBe(400);
  });
});
