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

const auth = (token) => `Bearer ${token}`;

describe('Authentication on /logs', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('401s on /logs/stock without a token', async () => {
    const res = await request(app).get('/logs/stock');
    expect(res.status).toBe(401);
  });

  test('401s on /logs/financial without a token', async () => {
    const res = await request(app).get('/logs/financial');
    expect(res.status).toBe(401);
  });

  test('401s on /logs/finishedobject without a token', async () => {
    const res = await request(app).get('/logs/finishedobject');
    expect(res.status).toBe(401);
  });

  test('401s for a malformed Authorization header', async () => {
    const res = await request(app).get('/logs/stock').set('Authorization', 'nonsense');
    expect(res.status).toBe(401);
  });

  test('401s for a token signed with the wrong secret', async () => {
    const token = jwt.sign({ userId: 1 }, 'wrong-secret');
    const res = await request(app).get('/logs/stock').set('Authorization', auth(token));
    expect(res.status).toBe(401);
  });

  test('401s for an expired token', async () => {
    const { user } = await makeAuthedUser('user 1');
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '-1s' });

    const res = await request(app).get('/logs/stock').set('Authorization', auth(token));
    expect(res.status).toBe(401);
  });
});

describe('GET /logs/stock', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns an empty array when there are none', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .get('/logs/stock')
      .set('Authorization', auth(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns logs written by material creation', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);

    await request(app)
      .post('/materials')
      .set('Authorization', auth(token))
      .send({
        name: 'Cotton', unit: 'm', pricePerUnit: '2.50', quantity: '10',
        categoryId: cat.id, createExpense: true
      });

    const res = await request(app)
      .get('/logs/stock')
      .set('Authorization', auth(token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toHaveProperty('action');
    expect(res.body[0]).toHaveProperty('materialId');
    expect(res.body[0].userId).toBe(user.id);
  });

  test('returns logs written by a restock', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    await request(app)
      .post(`/materials/${mat.id}/restock`)
      .set('Authorization', auth(token))
      .send({ noUnits: '5', pricePerUnit: '2.50', isUpdated: false });

    const res = await request(app)
      .get('/logs/stock')
      .set('Authorization', auth(token));

    expect(res.body).toHaveLength(1);
    expect(res.body[0].materialId).toBe(mat.id);
  });

  test('returns one log per material when an FO is created', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const foCat = await makeCategory(user.id, 'Bags', 'finishedObject');
    const matCat = await makeCategory(user.id);
    const a = await makeMaterial(user.id, matCat.id, { name: 'Cotton', quantity: '10' });
    const b = await makeMaterial(user.id, matCat.id, { name: 'Linen', quantity: '10' });

    await request(app)
      .post('/finishedObjects')
      .set('Authorization', auth(token))
      .send({
        name: 'Tote', description: 'x', categoryId: foCat.id, askingPrice: '25.00',
        materials: [
          { materialId: a.id, quantityUsed: '2' },
          { materialId: b.id, quantityUsed: '3' }
        ]
      });

    const res = await request(app)
      .get('/logs/stock')
      .set('Authorization', auth(token));

    expect(res.body).toHaveLength(2);
  });

  test('returns a log written by a material patch', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    await request(app)
      .patch(`/materials/${mat.id}`)
      .set('Authorization', auth(token))
      .send({ name: 'Organic Cotton' });

    const res = await request(app)
      .get('/logs/stock')
      .set('Authorization', auth(token));

    expect(res.body).toHaveLength(1);
    expect(res.body[0].action).toContain('name');
  });

  test('accumulates logs across operations', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    await request(app)
      .post(`/materials/${mat.id}/restock`)
      .set('Authorization', auth(token))
      .send({ noUnits: '5', pricePerUnit: '2.50', isUpdated: false });

    await request(app)
      .patch(`/materials/${mat.id}`)
      .set('Authorization', auth(token))
      .send({ name: 'Renamed' });

    const res = await request(app)
      .get('/logs/stock')
      .set('Authorization', auth(token));

    expect(res.body).toHaveLength(2);
  });

  test('returns only the requesting user\'s stock logs', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const catA = await makeCategory(userA.user.id);
    const catB = await makeCategory(userB.user.id);

    await request(app)
      .post('/materials')
      .set('Authorization', auth(userA.token))
      .send({
        name: 'Cotton', unit: 'm', pricePerUnit: '2.50', quantity: '10',
        categoryId: catA.id, createExpense: true
      });

    await request(app)
      .post('/materials')
      .set('Authorization', auth(userB.token))
      .send({
        name: 'Linen', unit: 'm', pricePerUnit: '3.00', quantity: '5',
        categoryId: catB.id, createExpense: true
      });

    expect(await prisma.stockLog.findMany()).toHaveLength(2);

    const res = await request(app)
      .get('/logs/stock')
      .set('Authorization', auth(userA.token));

    expect(res.body).toHaveLength(1);
    expect(res.body[0].userId).toBe(userA.user.id);
  });
});

describe('GET /logs/financial', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns an empty array when there are none', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .get('/logs/financial')
      .set('Authorization', auth(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns a log written by expense creation', async () => {
    const { token } = await makeAuthedUser('user 1');

    await request(app)
      .post('/expenses')
      .set('Authorization', auth(token))
      .send({ name: 'Shipping', cost: '4.50', materialId: null, description: 'Postage' });

    const res = await request(app)
      .get('/logs/financial')
      .set('Authorization', auth(token));

    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe('expense');
    expect(res.body[0].amount.toString()).toBe('4.5');
  });

  test('returns a log written by money in creation', async () => {
    const { token } = await makeAuthedUser('user 1');

    await request(app)
      .post('/moneyIn')
      .set('Authorization', auth(token))
      .send({ name: 'Sale', amount: '30.00', description: 'Etsy', finishedObjectId: null });

    const res = await request(app)
      .get('/logs/financial')
      .set('Authorization', auth(token));

    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe('money in');
  });

  // the point of the snapshot: the log survives the deleted record
  test('retains logs after the expense is deleted', async () => {
    const { token } = await makeAuthedUser('user 1');

    const created = await request(app)
      .post('/expenses')
      .set('Authorization', auth(token))
      .send({ name: 'Shipping', cost: '4.50', materialId: null, description: 'Postage' });

    await request(app)
      .delete(`/expenses/${created.body.id}`)
      .set('Authorization', auth(token));

    expect(await prisma.expense.findMany()).toHaveLength(0);

    const res = await request(app)
      .get('/logs/financial')
      .set('Authorization', auth(token));

    expect(res.body).toHaveLength(2);
    expect(res.body.every((l) => l.amount.toString() === '4.5')).toBe(true);
  });

  test('records both expense and money in types together', async () => {
    const { token } = await makeAuthedUser('user 1');

    await request(app)
      .post('/expenses')
      .set('Authorization', auth(token))
      .send({ name: 'Shipping', cost: '4.50', materialId: null, description: 'x' });

    await request(app)
      .post('/moneyIn')
      .set('Authorization', auth(token))
      .send({ name: 'Sale', amount: '30.00', description: 'y', finishedObjectId: null });

    const res = await request(app)
      .get('/logs/financial')
      .set('Authorization', auth(token));

    expect(res.body).toHaveLength(2);
    expect(res.body.map((l) => l.type).sort()).toEqual(['expense', 'money in']);
  });

  test('returns only the requesting user\'s financial logs', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    await request(app)
      .post('/expenses')
      .set('Authorization', auth(userA.token))
      .send({ name: 'Shipping', cost: '4.50', materialId: null, description: 'x' });

    await request(app)
      .post('/moneyIn')
      .set('Authorization', auth(userB.token))
      .send({ name: 'Sale', amount: '30.00', description: 'y', finishedObjectId: null });

    expect(await prisma.financialLog.findMany()).toHaveLength(2);

    const res = await request(app)
      .get('/logs/financial')
      .set('Authorization', auth(userA.token));

    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe('expense');
    expect(res.body[0].userId).toBe(userA.user.id);
  });
});

describe('GET /logs/finishedobject', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns an empty array when there are none', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .get('/logs/finishedobject')
      .set('Authorization', auth(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns a log written by FO creation', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const foCat = await makeCategory(user.id, 'Bags', 'finishedObject');
    const matCat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, matCat.id);

    const created = await request(app)
      .post('/finishedObjects')
      .set('Authorization', auth(token))
      .send({
        name: 'Tote', description: 'x', categoryId: foCat.id, askingPrice: '25.00',
        materials: [{ materialId: mat.id, quantityUsed: '2' }]
      });

    const res = await request(app)
      .get('/logs/finishedobject')
      .set('Authorization', auth(token));

    expect(res.body).toHaveLength(1);
    expect(res.body[0].FOId).toBe(created.body.id);
    expect(res.body[0].userId).toBe(user.id);
  });

  test('returns a log written by an FO patch', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id, 'Bags', 'finishedObject');
    const fo = await makeFO(user.id, cat.id);

    await request(app)
      .patch(`/finishedObjects/${fo.id}`)
      .set('Authorization', auth(token))
      .send({ name: 'Large Tote' });

    const res = await request(app)
      .get('/logs/finishedobject')
      .set('Authorization', auth(token));

    expect(res.body).toHaveLength(1);
    expect(res.body[0].action).toContain('name');
  });

  test('returns a log written when an FO is hidden', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id, 'Bags', 'finishedObject');
    const fo = await makeFO(user.id, cat.id);

    await request(app)
      .delete(`/finishedObjects/${fo.id}`)
      .set('Authorization', auth(token));

    const res = await request(app)
      .get('/logs/finishedobject')
      .set('Authorization', auth(token));

    expect(res.body).toHaveLength(1);
    expect(res.body[0].FOId).toBe(fo.id);
  });

  test('accumulates logs across operations on the same FO', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id, 'Bags', 'finishedObject');
    const fo = await makeFO(user.id, cat.id);

    await request(app)
      .patch(`/finishedObjects/${fo.id}`)
      .set('Authorization', auth(token))
      .send({ name: 'Large Tote' });

    await request(app)
      .delete(`/finishedObjects/${fo.id}`)
      .set('Authorization', auth(token));

    const res = await request(app)
      .get('/logs/finishedobject')
      .set('Authorization', auth(token));

    expect(res.body).toHaveLength(2);
  });

  test('returns only the requesting user\'s FO logs', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const catA = await makeCategory(userA.user.id, 'Bags', 'finishedObject');
    const catB = await makeCategory(userB.user.id, 'Bags', 'finishedObject');

    const foA = await makeFO(userA.user.id, catA.id);
    const foB = await makeFO(userB.user.id, catB.id);

    await request(app)
      .patch(`/finishedObjects/${foA.id}`)
      .set('Authorization', auth(userA.token))
      .send({ name: 'Large Tote' });

    await request(app)
      .patch(`/finishedObjects/${foB.id}`)
      .set('Authorization', auth(userB.token))
      .send({ name: 'Small Pouch' });

    expect(await prisma.fOlog.findMany()).toHaveLength(2);

    const res = await request(app)
      .get('/logs/finishedobject')
      .set('Authorization', auth(userA.token));

    expect(res.body).toHaveLength(1);
    expect(res.body[0].FOId).toBe(foA.id);
  });
});