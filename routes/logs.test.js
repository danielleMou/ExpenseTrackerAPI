import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import prisma from '../prisma.js';
import resetDatabase from './tests/resetDatabase.js';

async function makeUser() {
  return prisma.user.create({ data: { username: "user", password: "pass" } });
}

async function makeCategory(userId, name = 'Fabric', type = 'material') {
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
      name: 'Tote', description: 'x', askingPrice: '25.00',
      status: 'unlisted', isProcessed: false, isDeleted: false,
      productionCost: '6.00', categoryId, userId, ...overrides
    }
  });
}

describe('GET /logs/stock', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns an empty array when there are none', async () => {
    const res = await request(app).get('/logs/stock');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns logs written by material creation', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);

    await request(app).post('/materials').send({
      name: 'Cotton', unit: 'm', pricePerUnit: '2.50', quantity: '10',
      categoryId: cat.id, createExpense: true, userId: user.id
    });

    const res = await request(app).get('/logs/stock');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toHaveProperty('action');
    expect(res.body[0]).toHaveProperty('materialId');
    expect(res.body[0].userId).toBe(user.id);
  });

  test('returns logs written by a restock', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    await request(app).post(`/materials/${mat.id}/restock`).send({
      noUnits: '5', pricePerUnit: '2.50', isUpdated: false, userId: user.id
    });

    const res = await request(app).get('/logs/stock');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].materialId).toBe(mat.id);
  });

  test('returns one log per material when an FO is created', async () => {
    const user = await makeUser();
    const foCat = await makeCategory(user.id, 'Bags', 'finishedObject');
    const matCat = await makeCategory(user.id);
    const a = await makeMaterial(user.id, matCat.id, { name: 'Cotton', quantity: '10' });
    const b = await makeMaterial(user.id, matCat.id, { name: 'Linen', quantity: '10' });

    await request(app).post('/finishedObjects').send({
      name: 'Tote', description: 'x', categoryId: foCat.id, askingPrice: '25.00',
      userId: user.id,
      materials: [
        { materialId: a.id, quantityUsed: '2' },
        { materialId: b.id, quantityUsed: '3' }
      ]
    });

    const res = await request(app).get('/logs/stock');
    expect(res.body).toHaveLength(2);
  });

  test('returns a log written by a material patch', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    await request(app).patch(`/materials/${mat.id}`).send({
      name: 'Organic Cotton', userId: user.id
    });

    const res = await request(app).get('/logs/stock');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].action).toContain('name');
  });

  test('accumulates logs across operations', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    await request(app).post(`/materials/${mat.id}/restock`).send({
      noUnits: '5', pricePerUnit: '2.50', isUpdated: false, userId: user.id
    });
    await request(app).patch(`/materials/${mat.id}`).send({
      name: 'Renamed', userId: user.id
    });

    const res = await request(app).get('/logs/stock');
    expect(res.body).toHaveLength(2);
  });
});

describe('GET /logs/financial', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns an empty array when there are none', async () => {
    const res = await request(app).get('/logs/financial');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns a log written by expense creation', async () => {
    const user = await makeUser();

    await request(app).post('/expenses').send({
      name: 'Shipping', cost: '4.50', materialId: null,
      description: 'Postage', userId: user.id
    });

    const res = await request(app).get('/logs/financial');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe('expense');
    expect(res.body[0].amount.toString()).toBe('4.5');
  });

  test('returns a log written by money in creation', async () => {
    const user = await makeUser();

    await request(app).post('/moneyIn').send({
      name: 'Sale', amount: '30.00', description: 'Etsy',
      finishedObjectId: null, userId: user.id
    });

    const res = await request(app).get('/logs/financial');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe('money in');
  });

  // the point of the snapshot: the log survives the deleted record
  test('retains logs after the expense is deleted', async () => {
    const user = await makeUser();

    const created = await request(app).post('/expenses').send({
      name: 'Shipping', cost: '4.50', materialId: null,
      description: 'Postage', userId: user.id
    });

    await request(app).delete(`/expenses/${created.body.id}`).send({ userId: user.id });

    expect(await prisma.expense.findMany()).toHaveLength(0);

    const res = await request(app).get('/logs/financial');
    expect(res.body).toHaveLength(2);
    expect(res.body.every((l) => l.amount.toString() === '4.5')).toBe(true);
  });

  test('records both expense and money in types together', async () => {
    const user = await makeUser();

    await request(app).post('/expenses').send({
      name: 'Shipping', cost: '4.50', materialId: null, description: 'x', userId: user.id
    });
    await request(app).post('/moneyIn').send({
      name: 'Sale', amount: '30.00', description: 'y', finishedObjectId: null, userId: user.id
    });

    const res = await request(app).get('/logs/financial');
    expect(res.body).toHaveLength(2);
    expect(res.body.map((l) => l.type).sort()).toEqual(['expense', 'money in']);
  });
});

describe('GET /logs/finishedobject', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns an empty array when there are none', async () => {
    const res = await request(app).get('/logs/finishedobject');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns a log written by FO creation', async () => {
    const user = await makeUser();
    const foCat = await makeCategory(user.id, 'Bags', 'finishedObject');
    const matCat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, matCat.id);

    const created = await request(app).post('/finishedObjects').send({
      name: 'Tote', description: 'x', categoryId: foCat.id, askingPrice: '25.00',
      userId: user.id, materials: [{ materialId: mat.id, quantityUsed: '2' }]
    });

    const res = await request(app).get('/logs/finishedobject');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].FOId).toBe(created.body.id);
    expect(res.body[0].userId).toBe(user.id);
  });

  test('returns a log written by an FO patch', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'Bags', 'finishedObject');
    const fo = await makeFO(user.id, cat.id);

    await request(app).patch(`/finishedObjects/${fo.id}`).send({
      name: 'Large Tote', userId: user.id
    });

    const res = await request(app).get('/logs/finishedobject');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].action).toContain('name');
  });

  test('returns a log written when an FO is hidden', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'Bags', 'finishedObject');
    const fo = await makeFO(user.id, cat.id);

    await request(app).delete(`/finishedObjects/${fo.id}`).send({ userId: user.id });

    const res = await request(app).get('/logs/finishedobject');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].FOId).toBe(fo.id);
  });

  test('accumulates logs across operations on the same FO', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'Bags', 'finishedObject');
    const fo = await makeFO(user.id, cat.id);

    await request(app).patch(`/finishedObjects/${fo.id}`).send({
      name: 'Large Tote', userId: user.id
    });
    await request(app).delete(`/finishedObjects/${fo.id}`).send({ userId: user.id });

    const res = await request(app).get('/logs/finishedobject');
    expect(res.body).toHaveLength(2);
  });
});