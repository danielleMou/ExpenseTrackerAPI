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

const auth = (token) => `Bearer ${token}`;

describe('Authentication on /finishedObjects', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('401s without an Authorization header', async () => {
    const res = await request(app).get('/finishedObjects');
    expect(res.status).toBe(401);
  });

  test('401s for a malformed Authorization header', async () => {
    const res = await request(app).get('/finishedObjects').set('Authorization', 'nonsense');
    expect(res.status).toBe(401);
  });

  test('401s for a token signed with the wrong secret', async () => {
    const token = jwt.sign({ userId: 1 }, 'wrong-secret');
    const res = await request(app).get('/finishedObjects').set('Authorization', auth(token));
    expect(res.status).toBe(401);
  });

  test('401s for an expired token', async () => {
    const { user } = await makeAuthedUser('user 1');
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '-1s' });

    const res = await request(app).get('/finishedObjects').set('Authorization', auth(token));
    expect(res.status).toBe(401);
  });

  test('401s on a write route without a token', async () => {
    const res = await request(app).post('/finishedObjects').send({ name: 'Tote' });
    expect(res.status).toBe(401);
    expect(await prisma.finishedObject.findMany()).toHaveLength(0);
  });
});

describe('GET /finishedObjects', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns an empty array when there are none', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .get('/finishedObjects')
      .set('Authorization', auth(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns all finished objects', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    await makeFO(user.id, cat.id, { name: 'Tote' });
    await makeFO(user.id, cat.id, { name: 'Pouch' });

    const res = await request(app)
      .get('/finishedObjects')
      .set('Authorization', auth(token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('includes deleted finished objects', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    await makeFO(user.id, cat.id, { isDeleted: true });

    const res = await request(app)
      .get('/finishedObjects')
      .set('Authorization', auth(token));

    expect(res.body).toHaveLength(1);
  });

  test('returns only the requesting user\'s finished objects', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const catA = await makeCategory(userA.user.id);
    const catB = await makeCategory(userB.user.id);

    await makeFO(userA.user.id, catA.id, { name: 'Tote' });
    await makeFO(userB.user.id, catB.id, { name: 'Pouch' });

    const res = await request(app)
      .get('/finishedObjects')
      .set('Authorization', auth(userA.token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Tote');
  });
});

describe('GET /finishedObjects/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns the finished object', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    const res = await request(app)
      .get(`/finishedObjects/${fo.id}`)
      .set('Authorization', auth(token));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(fo.id);
    expect(res.body.name).toBe('Tote');
  });

  test('404s for one that does not exist', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .get('/finishedObjects/999999')
      .set('Authorization', auth(token));

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('404s for another user\'s finished object', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const catB = await makeCategory(userB.user.id);
    const foB = await makeFO(userB.user.id, catB.id);

    const res = await request(app)
      .get(`/finishedObjects/${foB.id}`)
      .set('Authorization', auth(userA.token));

    expect(res.status).toBe(404);
  });

  test('400s for a non-numeric id', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .get('/finishedObjects/abc')
      .set('Authorization', auth(token));

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  // OPEN QUESTION: should a deleted FO be retrievable directly?
  test('returns a deleted finished object by id', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id, { isDeleted: true });

    const res = await request(app)
      .get(`/finishedObjects/${fo.id}`)
      .set('Authorization', auth(token));

    expect(res.status).toBe(200);
  });
});

describe('POST /finishedObjects', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('creates an FO, deducts stock and writes logs', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const foCat = await makeCategory(user.id);
    const matCat = await makeCategory(user.id, 'Fabric', 'material');
    const mat = await makeMaterial(user.id, matCat.id, { quantity: '10' });

    const res = await request(app)
      .post('/finishedObjects')
      .set('Authorization', auth(token))
      .send({
        name: 'Tote',
        description: 'A canvas tote',
        categoryId: foCat.id,
        askingPrice: '25.00',
        materials: [{ materialId: mat.id, quantityUsed: '3' }]
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Tote');
    expect(res.body.productionCost.toString()).toBe('7.5');

    const updated = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(updated.quantity.toString()).toBe('7');
    expect(await prisma.quantityUsed.findMany()).toHaveLength(1);
    expect(await prisma.stockLog.findMany()).toHaveLength(1);
    expect(await prisma.fOlog.findMany()).toHaveLength(1);
  });

  test('records the FO against the token\'s user, ignoring a userId in the body', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const foCat = await makeCategory(userA.user.id);
    const matCat = await makeCategory(userA.user.id, 'Fabric', 'material');
    const mat = await makeMaterial(userA.user.id, matCat.id, { quantity: '10' });

    const res = await request(app)
      .post('/finishedObjects')
      .set('Authorization', auth(userA.token))
      .send({
        name: 'Tote',
        description: 'A canvas tote',
        categoryId: foCat.id,
        askingPrice: '25.00',
        userId: userB.user.id,
        materials: [{ materialId: mat.id, quantityUsed: '3' }]
      });

    expect(res.status).toBe(201);

    const created = await prisma.finishedObject.findMany();
    expect(created).toHaveLength(1);
    expect(created[0].userId).toBe(userA.user.id);
  });

  test('400s when required fields are missing', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .post('/finishedObjects')
      .set('Authorization', auth(token))
      .send({});

    expect(res.status).toBe(400);
    expect(await prisma.finishedObject.findMany()).toHaveLength(0);
  });

  test('400s for an empty materials array', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);

    const res = await request(app)
      .post('/finishedObjects')
      .set('Authorization', auth(token))
      .send({
        name: 'Tote', description: 'x', categoryId: cat.id,
        askingPrice: '25.00', materials: []
      });

    expect(res.status).toBe(400);
    expect(await prisma.finishedObject.findMany()).toHaveLength(0);
  });

  test('404s for a nonexistent material', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);

    const res = await request(app)
      .post('/finishedObjects')
      .set('Authorization', auth(token))
      .send({
        name: 'Tote', description: 'x', categoryId: cat.id,
        askingPrice: '25.00',
        materials: [{ materialId: 999999, quantityUsed: '1' }]
      });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('404s for another user\'s material and leaves its stock untouched', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const foCatA = await makeCategory(userA.user.id);
    const matCatB = await makeCategory(userB.user.id, 'Fabric', 'material');
    const matB = await makeMaterial(userB.user.id, matCatB.id, { quantity: '10' });

    const res = await request(app)
      .post('/finishedObjects')
      .set('Authorization', auth(userA.token))
      .send({
        name: 'Tote', description: 'x', categoryId: foCatA.id,
        askingPrice: '25.00',
        materials: [{ materialId: matB.id, quantityUsed: '3' }]
      });

    expect(res.status).toBe(404);
    expect(await prisma.finishedObject.findMany()).toHaveLength(0);

    const untouched = await prisma.material.findUnique({ where: { id: matB.id } });
    expect(untouched.quantity.toString()).toBe('10');
    expect(await prisma.quantityUsed.findMany()).toHaveLength(0);
  });

  test('404s when only one material in the batch belongs to another user', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const foCatA = await makeCategory(userA.user.id);
    const matCatA = await makeCategory(userA.user.id, 'Fabric', 'material');
    const matA = await makeMaterial(userA.user.id, matCatA.id, { quantity: '10' });

    const matCatB = await makeCategory(userB.user.id, 'Fabric', 'material');
    const matB = await makeMaterial(userB.user.id, matCatB.id, { quantity: '10' });

    const res = await request(app)
      .post('/finishedObjects')
      .set('Authorization', auth(userA.token))
      .send({
        name: 'Tote', description: 'x', categoryId: foCatA.id,
        askingPrice: '25.00',
        materials: [
          { materialId: matA.id, quantityUsed: '2' },
          { materialId: matB.id, quantityUsed: '2' }
        ]
      });

    expect(res.status).toBe(404);
    expect(await prisma.finishedObject.findMany()).toHaveLength(0);

    const ownMaterial = await prisma.material.findUnique({ where: { id: matA.id } });
    expect(ownMaterial.quantity.toString()).toBe('10');
    expect(await prisma.stockLog.findMany()).toHaveLength(0);
  });

  test('400s for insufficient stock and writes nothing', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const foCat = await makeCategory(user.id);
    const matCat = await makeCategory(user.id, 'Fabric', 'material');
    const mat = await makeMaterial(user.id, matCat.id, { quantity: '2' });

    const res = await request(app)
      .post('/finishedObjects')
      .set('Authorization', auth(token))
      .send({
        name: 'Tote', description: 'x', categoryId: foCat.id,
        askingPrice: '25.00',
        materials: [{ materialId: mat.id, quantityUsed: '5' }]
      });

    expect(res.status).toBe(400);
    expect(await prisma.finishedObject.findMany()).toHaveLength(0);

    const untouched = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(untouched.quantity.toString()).toBe('2');
  });

  test('400s for a nonexistent category', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const matCat = await makeCategory(user.id, 'Fabric', 'material');
    const mat = await makeMaterial(user.id, matCat.id);

    const res = await request(app)
      .post('/finishedObjects')
      .set('Authorization', auth(token))
      .send({
        name: 'Tote', description: 'x', categoryId: 999999,
        askingPrice: '25.00',
        materials: [{ materialId: mat.id, quantityUsed: '1' }]
      });

    expect(res.status).toBe(400);
  });

  test('400s for a category belonging to another user', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const catB = await makeCategory(userB.user.id);
    const matCatA = await makeCategory(userA.user.id, 'Fabric', 'material');
    const matA = await makeMaterial(userA.user.id, matCatA.id, { quantity: '10' });

    const res = await request(app)
      .post('/finishedObjects')
      .set('Authorization', auth(userA.token))
      .send({
        name: 'Tote', description: 'x', categoryId: catB.id,
        askingPrice: '25.00',
        materials: [{ materialId: matA.id, quantityUsed: '1' }]
      });

    expect(res.status).toBe(400);
    expect(await prisma.finishedObject.findMany()).toHaveLength(0);

    const untouched = await prisma.material.findUnique({ where: { id: matA.id } });
    expect(untouched.quantity.toString()).toBe('10');
  });
});

describe('PATCH /finishedObjects/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('updates a field and writes a log', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    const res = await request(app)
      .patch(`/finishedObjects/${fo.id}`)
      .set('Authorization', auth(token))
      .send({ name: 'Large Tote' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Large Tote');
    expect(await prisma.fOlog.findMany()).toHaveLength(1);
  });

  test('can mark an FO as sold', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    const res = await request(app)
      .patch(`/finishedObjects/${fo.id}`)
      .set('Authorization', auth(token))
      .send({ status: 'sold' });

    expect(res.status).toBe(200);

    const updated = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(updated.status).toBe('sold');
  });

  test('400s for an empty body', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    const res = await request(app)
      .patch(`/finishedObjects/${fo.id}`)
      .set('Authorization', auth(token))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(await prisma.fOlog.findMany()).toHaveLength(0);
  });

  test('400s for a non-numeric id', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .patch('/finishedObjects/abc')
      .set('Authorization', auth(token))
      .send({ name: 'x' });

    expect(res.status).toBe(400);
  });

  test('404s for one that does not exist', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .patch('/finishedObjects/999999')
      .set('Authorization', auth(token))
      .send({ name: 'x' });

    expect(res.status).toBe(404);
  });

  test('404s when editing another user\'s FO and leaves it untouched', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const catB = await makeCategory(userB.user.id);
    const foB = await makeFO(userB.user.id, catB.id);

    const res = await request(app)
      .patch(`/finishedObjects/${foB.id}`)
      .set('Authorization', auth(userA.token))
      .send({ name: 'Hijacked' });

    expect(res.status).toBe(404);

    const untouched = await prisma.finishedObject.findUnique({ where: { id: foB.id } });
    expect(untouched.name).toBe('Tote');
    expect(await prisma.fOlog.findMany()).toHaveLength(0);
  });

  test('400s for an invalid field value', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    const res = await request(app)
      .patch(`/finishedObjects/${fo.id}`)
      .set('Authorization', auth(token))
      .send({ name: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });
});

describe('DELETE /finishedObjects/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('hides the FO and writes a log', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    const res = await request(app)
      .delete(`/finishedObjects/${fo.id}`)
      .set('Authorization', auth(token));

    expect(res.status).toBe(200);

    const updated = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(updated.isDeleted).toBe(true);
    expect(await prisma.fOlog.findMany()).toHaveLength(1);
  });

  test('400s when the FO is sold', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id, { status: 'sold' });

    const res = await request(app)
      .delete(`/finishedObjects/${fo.id}`)
      .set('Authorization', auth(token));

    expect(res.status).toBe(400);

    const untouched = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(untouched.isDeleted).toBe(false);
  });

  test('404s for one that does not exist', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .delete('/finishedObjects/999999')
      .set('Authorization', auth(token));

    expect(res.status).toBe(404);
  });

  test('404s when deleting another user\'s FO and leaves it untouched', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const catB = await makeCategory(userB.user.id);
    const foB = await makeFO(userB.user.id, catB.id);

    const res = await request(app)
      .delete(`/finishedObjects/${foB.id}`)
      .set('Authorization', auth(userA.token));

    expect(res.status).toBe(404);

    const untouched = await prisma.finishedObject.findUnique({ where: { id: foB.id } });
    expect(untouched.isDeleted).toBe(false);
    expect(await prisma.fOlog.findMany()).toHaveLength(0);
  });

  test('400s for a non-numeric id', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .delete('/finishedObjects/abc')
      .set('Authorization', auth(token));

    expect(res.status).toBe(400);
  });

  test('does not restore material stock', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const foCat = await makeCategory(user.id);
    const matCat = await makeCategory(user.id, 'Fabric', 'material');
    const mat = await makeMaterial(user.id, matCat.id, { quantity: '10' });

    const created = await request(app)
      .post('/finishedObjects')
      .set('Authorization', auth(token))
      .send({
        name: 'Tote', description: 'x', categoryId: foCat.id,
        askingPrice: '25.00',
        materials: [{ materialId: mat.id, quantityUsed: '3' }]
      });

    await request(app)
      .delete(`/finishedObjects/${created.body.id}`)
      .set('Authorization', auth(token));

    const updated = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(updated.quantity.toString()).toBe('7');
  });
});

describe('POST /finishedObjects/:id/process', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('processes a sold FO with expenses', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id, { status: 'sold' });

    const res = await request(app)
      .post(`/finishedObjects/${fo.id}/process`)
      .set('Authorization', auth(token))
      .send({
        salePrice: '30.00',
        expenses: [
          { name: 'Postage', cost: '3.85', description: 'Royal Mail' },
          { name: 'Etsy fee', cost: '1.95', description: 'Platform cut' }
        ]
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
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id, { status: 'sold' });

    const res = await request(app)
      .post(`/finishedObjects/${fo.id}/process`)
      .set('Authorization', auth(token))
      .send({ salePrice: '30.00', expenses: [] });

    expect(res.status).toBe(200);
    expect(await prisma.expense.findMany()).toHaveLength(0);
    expect(await prisma.financialLog.findMany()).toHaveLength(1);
  });

  test('404s when the FO does not exist', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .post('/finishedObjects/999999/process')
      .set('Authorization', auth(token))
      .send({ salePrice: '30.00', expenses: [] });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('404s when processing another user\'s FO and records no money', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const catB = await makeCategory(userB.user.id);
    const foB = await makeFO(userB.user.id, catB.id, { status: 'sold' });

    const res = await request(app)
      .post(`/finishedObjects/${foB.id}/process`)
      .set('Authorization', auth(userA.token))
      .send({
        salePrice: '30.00',
        expenses: [{ name: 'Postage', cost: '3.85', description: 'Royal Mail' }]
      });

    expect(res.status).toBe(404);

    const untouched = await prisma.finishedObject.findUnique({ where: { id: foB.id } });
    expect(untouched.isProcessed).toBe(false);
    expect(await prisma.moneyIn.findMany()).toHaveLength(0);
    expect(await prisma.expense.findMany()).toHaveLength(0);
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('400s when the FO is already processed', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id, { status: 'sold', isProcessed: true });

    const res = await request(app)
      .post(`/finishedObjects/${fo.id}/process`)
      .set('Authorization', auth(token))
      .send({ salePrice: '30.00', expenses: [] });

    expect(res.status).toBe(400);
    expect(await prisma.moneyIn.findMany()).toHaveLength(0);
  });

  test('400s when the FO has not been marked sold', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id, { status: 'unlisted' });

    const res = await request(app)
      .post(`/finishedObjects/${fo.id}/process`)
      .set('Authorization', auth(token))
      .send({ salePrice: '30.00', expenses: [] });

    expect(res.status).toBe(400);
    expect(await prisma.moneyIn.findMany()).toHaveLength(0);
  });

  test('400s when required fields are missing', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id, { status: 'sold' });

    const res = await request(app)
      .post(`/finishedObjects/${fo.id}/process`)
      .set('Authorization', auth(token))
      .send({});

    expect(res.status).toBe(400);
    expect(await prisma.moneyIn.findMany()).toHaveLength(0);
  });

  test('400s for a non-numeric id', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .post('/finishedObjects/abc/process')
      .set('Authorization', auth(token))
      .send({ salePrice: '30.00', expenses: [] });

    expect(res.status).toBe(400);
  });
});