import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import prisma from '../prisma.js';
import resetDatabase from './tests/resetDatabase.js';

async function makeUser() {
  return prisma.user.create({ data: { username: "user", password: "pass" } });
}

async function makeCategory(userId, name = 'Bags', type = 'finishedObject') {
  return prisma.category.create({ data: { name, type, userId } });
}

async function makeMaterial(userId, categoryId, overrides = {}) {
  return prisma.material.create({
    data: {
      name: 'Cotton', unit: 'm', quantity: '10', pricePerUnit: '2.50',
      categoryId, userId, ...overrides
    }
  });
}

async function makeFO(userId, categoryId, overrides = {}) {
  return prisma.finishedObject.create({
    data: {
      name: 'Tote', description: 'A canvas tote', askingPrice: '25.00',
      status: 'unlisted', isProcessed: false, isDeleted: false,
      productionCost: '6.00', categoryId, userId, ...overrides
    }
  });
}

describe('GET /finishedObjects', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns an empty array when there are none', async () => {
    const res = await request(app).get('/finishedObjects');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns all finished objects', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    await makeFO(user.id, cat.id, { name: 'Tote' });
    await makeFO(user.id, cat.id, { name: 'Pouch' });

    const res = await request(app).get('/finishedObjects');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('includes deleted finished objects', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    await makeFO(user.id, cat.id, { isDeleted: true });

    const res = await request(app).get('/finishedObjects');
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /finishedObjects/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns the finished object', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    const res = await request(app).get(`/finishedObjects/${fo.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(fo.id);
    expect(res.body.name).toBe('Tote');
  });

  test('404s for one that does not exist', async () => {
    const res = await request(app).get('/finishedObjects/999999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('400s for a non-numeric id', async () => {
    const res = await request(app).get('/finishedObjects/abc');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  // OPEN QUESTION: should a deleted FO be retrievable directly?
  test('returns a deleted finished object by id', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id, { isDeleted: true });

    const res = await request(app).get(`/finishedObjects/${fo.id}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /finishedObjects', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('creates an FO, deducts stock and writes logs', async () => {
    const user = await makeUser();
    const foCat = await makeCategory(user.id);
    const matCat = await makeCategory(user.id, 'Fabric', 'material');
    const mat = await makeMaterial(user.id, matCat.id, { quantity: '10' });

    const res = await request(app)
      .post('/finishedObjects')
      .send({
        name: 'Tote',
        description: 'A canvas tote',
        categoryId: foCat.id,
        askingPrice: '25.00',
        userId: user.id,
        materials: [{ materialId: mat.id, quantityUsed: '3' }]
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Tote');
    expect(res.body.productionCost.toString()).toBe('7.5');

    const updated = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(updated.quantity.toString()).toBe('7');
    expect(await prisma.quantityUsed.findMany()).toHaveLength(1);
    expect(await prisma.stockLog.findMany()).toHaveLength(1);
    expect(await prisma.FOlog.findMany()).toHaveLength(1);
  });

  test('400s when required fields are missing', async () => {
    const res = await request(app).post('/finishedObjects').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(await prisma.finishedObject.findMany()).toHaveLength(0);
  });

  test('400s for an empty materials array', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);

    const res = await request(app)
      .post('/finishedObjects')
      .send({
        name: 'Tote', description: 'x', categoryId: cat.id,
        askingPrice: '25.00', userId: user.id, materials: []
      });

    expect(res.status).toBe(400);
    expect(await prisma.finishedObject.findMany()).toHaveLength(0);
  });

  test('404s for a nonexistent material', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);

    const res = await request(app)
      .post('/finishedObjects')
      .send({
        name: 'Tote', description: 'x', categoryId: cat.id,
        askingPrice: '25.00', userId: user.id,
        materials: [{ materialId: 999999, quantityUsed: '1' }]
      });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('400s for insufficient stock and writes nothing', async () => {
    const user = await makeUser();
    const foCat = await makeCategory(user.id);
    const matCat = await makeCategory(user.id, 'Fabric', 'material');
    const mat = await makeMaterial(user.id, matCat.id, { quantity: '2' });

    const res = await request(app)
      .post('/finishedObjects')
      .send({
        name: 'Tote', description: 'x', categoryId: foCat.id,
        askingPrice: '25.00', userId: user.id,
        materials: [{ materialId: mat.id, quantityUsed: '5' }]
      });

    expect(res.status).toBe(400);
    expect(await prisma.finishedObject.findMany()).toHaveLength(0);

    const untouched = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(untouched.quantity.toString()).toBe('2');
  });

  test('400s for a nonexistent category', async () => {
    const user = await makeUser();
    const matCat = await makeCategory(user.id, 'Fabric', 'material');
    const mat = await makeMaterial(user.id, matCat.id);

    const res = await request(app)
      .post('/finishedObjects')
      .send({
        name: 'Tote', description: 'x', categoryId: 999999,
        askingPrice: '25.00', userId: user.id,
        materials: [{ materialId: mat.id, quantityUsed: '1' }]
      });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /finishedObjects/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('updates a field and writes a log', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    const res = await request(app)
      .patch(`/finishedObjects/${fo.id}`)
      .send({ name: 'Large Tote', userId: user.id });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Large Tote');
    expect(await prisma.FOlog.findMany()).toHaveLength(1);
  });

  test('can mark an FO as sold', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    const res = await request(app)
      .patch(`/finishedObjects/${fo.id}`)
      .send({ status: 'sold', userId: user.id });

    expect(res.status).toBe(200);
    const updated = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(updated.status).toBe('sold');
  });

  test('400s for an empty body', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    const res = await request(app).patch(`/finishedObjects/${fo.id}`).send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(await prisma.FOlog.findMany()).toHaveLength(0);
  });

  test('400s for a non-numeric id', async () => {
    const res = await request(app).patch('/finishedObjects/abc').send({ name: 'x' });
    expect(res.status).toBe(400);
  });

  test('404s for one that does not exist', async () => {
    const user = await makeUser();

    const res = await request(app)
      .patch('/finishedObjects/999999')
      .send({ name: 'x', userId: user.id });

    expect(res.status).toBe(404);
  });

  test('400s for an invalid field value', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    const res = await request(app)
      .patch(`/finishedObjects/${fo.id}`)
      .send({ name: '', userId: user.id });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });
});

describe('DELETE /finishedObjects/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('hides the FO and writes a log', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    const res = await request(app)
      .delete(`/finishedObjects/${fo.id}`)
      .send({ userId: user.id });

    expect(res.status).toBe(200);

    const updated = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(updated.isDeleted).toBe(true);
    expect(await prisma.FOlog.findMany()).toHaveLength(1);
  });

  test('400s when the FO is sold', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id, { status: 'sold' });

    const res = await request(app)
      .delete(`/finishedObjects/${fo.id}`)
      .send({ userId: user.id });

    expect(res.status).toBe(400);

    const untouched = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(untouched.isDeleted).toBe(false);
  });

  test('404s for one that does not exist', async () => {
    const user = await makeUser();

    const res = await request(app)
      .delete('/finishedObjects/999999')
      .send({ userId: user.id });

    expect(res.status).toBe(404);
  });

  test('400s for a non-numeric id', async () => {
    const res = await request(app).delete('/finishedObjects/abc').send({});
    expect(res.status).toBe(400);
  });

  test('does not restore material stock', async () => {
    const user = await makeUser();
    const foCat = await makeCategory(user.id);
    const matCat = await makeCategory(user.id, 'Fabric', 'material');
    const mat = await makeMaterial(user.id, matCat.id, { quantity: '10' });

    const created = await request(app)
      .post('/finishedObjects')
      .send({
        name: 'Tote', description: 'x', categoryId: foCat.id,
        askingPrice: '25.00', userId: user.id,
        materials: [{ materialId: mat.id, quantityUsed: '3' }]
      });

    await request(app)
      .delete(`/finishedObjects/${created.body.id}`)
      .send({ userId: user.id });

    const updated = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(updated.quantity.toString()).toBe('7');
  });
});

describe('POST /finishedObjects/:id/process', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('processes a sold FO with expenses', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id, { status: 'sold' });

    const res = await request(app)
      .post(`/finishedObjects/${fo.id}/process`)
      .send({
        salePrice: '30.00',
        expenses: [
          { name: 'Postage', cost: '3.85', description: 'Royal Mail' },
          { name: 'Etsy fee', cost: '1.95', description: 'Platform cut' }
        ],
        userId: user.id
      });

    expect(res.status).toBe(200);

    const updated = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(updated.isProcessed).toBe(true);

    const moneyIn = await prisma.moneyIn.findMany();
    expect(moneyIn).toHaveLength(1);
    expect(moneyIn[0].amount.toString()).toBe('30');
    expect(moneyIn[0].FOId).toBe(fo.id);

    expect(await prisma.expense.findMany()).toHaveLength(2);
    expect(await prisma.financialLog.findMany()).toHaveLength(3);
  });

  test('processes a sold FO with no expenses', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id, { status: 'sold' });

    const res = await request(app)
      .post(`/finishedObjects/${fo.id}/process`)
      .send({ salePrice: '30.00', expenses: [], userId: user.id });

    expect(res.status).toBe(200);
    expect(await prisma.expense.findMany()).toHaveLength(0);
    expect(await prisma.financialLog.findMany()).toHaveLength(1);
  });

  test('404s when the FO does not exist', async () => {
    const user = await makeUser();

    const res = await request(app)
      .post('/finishedObjects/999999/process')
      .send({ salePrice: '30.00', expenses: [], userId: user.id });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('400s when the FO is already processed', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id, { status: 'sold', isProcessed: true });

    const res = await request(app)
      .post(`/finishedObjects/${fo.id}/process`)
      .send({ salePrice: '30.00', expenses: [], userId: user.id });

    expect(res.status).toBe(400);
    expect(await prisma.moneyIn.findMany()).toHaveLength(0);
  });

  test('400s when the FO has not been marked sold', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id, { status: 'unlisted' });

    const res = await request(app)
      .post(`/finishedObjects/${fo.id}/process`)
      .send({ salePrice: '30.00', expenses: [], userId: user.id });

    expect(res.status).toBe(400);
    expect(await prisma.moneyIn.findMany()).toHaveLength(0);
  });

  test('400s when required fields are missing', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id, { status: 'sold' });

    const res = await request(app).post(`/finishedObjects/${fo.id}/process`).send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(await prisma.moneyIn.findMany()).toHaveLength(0);
  });

  test('400s for a non-numeric id', async () => {
    const res = await request(app)
      .post('/finishedObjects/abc/process')
      .send({ salePrice: '30.00', expenses: [] });

    expect(res.status).toBe(400);
  });
});