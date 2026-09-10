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

async function makeExpense(userId, overrides = {}) {
  return prisma.expense.create({
    data: {
      name: 'Fabric order', cost: '19.99', description: 'Spring restock',
      userId, ...overrides
    }
  });
}

const auth = (token) => `Bearer ${token}`;

describe('Authentication on /expenses', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('401s without an Authorization header', async () => {
    const res = await request(app).get('/expenses');
    expect(res.status).toBe(401);
  });

  test('401s for a malformed Authorization header', async () => {
    const res = await request(app).get('/expenses').set('Authorization', 'nonsense');
    expect(res.status).toBe(401);
  });

  test('401s for a token signed with the wrong secret', async () => {
    const token = jwt.sign({ userId: 1 }, 'wrong-secret');
    const res = await request(app).get('/expenses').set('Authorization', auth(token));
    expect(res.status).toBe(401);
  });

  test('401s for an expired token', async () => {
    const { user } = await makeAuthedUser('user 1');
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '-1s' });

    const res = await request(app).get('/expenses').set('Authorization', auth(token));
    expect(res.status).toBe(401);
  });

  test('401s on a write route without a token', async () => {
    const res = await request(app)
      .post('/expenses')
      .send({ name: 'Shipping', cost: '4.50', materialId: null, description: 'x' });

    expect(res.status).toBe(401);
    expect(await prisma.expense.findMany()).toHaveLength(0);
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });
});

describe('GET /expenses', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns an empty array when there are none', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .get('/expenses')
      .set('Authorization', auth(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns all expenses', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    await makeExpense(user.id, { name: 'Fabric order' });
    await makeExpense(user.id, { name: 'Shipping' });

    const res = await request(app)
      .get('/expenses')
      .set('Authorization', auth(token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('returns only the requesting user\'s expenses', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    await makeExpense(userA.user.id, { name: 'Fabric order' });
    await makeExpense(userB.user.id, { name: 'Shipping' });

    const res = await request(app)
      .get('/expenses')
      .set('Authorization', auth(userA.token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Fabric order');
  });
});

describe('POST /expenses', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('creates an expense linked to a material and writes a log', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    const res = await request(app)
      .post('/expenses')
      .set('Authorization', auth(token))
      .send({
        name: 'Fabric order',
        cost: '19.99',
        materialId: mat.id,
        description: 'Spring restock'
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Fabric order');
    expect(res.body.materialId).toBe(mat.id);

    expect(await prisma.expense.findMany()).toHaveLength(1);

    const logs = await prisma.financialLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('expense');
    expect(logs[0].amount.toString()).toBe('19.99');
  });

  test('creates a standalone expense with no material link', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .post('/expenses')
      .set('Authorization', auth(token))
      .send({
        name: 'Shipping',
        cost: '4.50',
        materialId: null,
        description: 'Postage'
      });

    expect(res.status).toBe(201);
    expect(res.body.materialId).toBeNull();
    expect(await prisma.financialLog.findMany()).toHaveLength(1);
  });

  test('records the expense against the token\'s user, ignoring a userId in the body', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const res = await request(app)
      .post('/expenses')
      .set('Authorization', auth(userA.token))
      .send({
        name: 'Shipping',
        cost: '4.50',
        materialId: null,
        description: 'Postage',
        userId: userB.user.id
      });

    expect(res.status).toBe(201);

    const expenses = await prisma.expense.findMany();
    expect(expenses).toHaveLength(1);
    expect(expenses[0].userId).toBe(userA.user.id);

    const logs = await prisma.financialLog.findMany();
    expect(logs[0].userId).toBe(userA.user.id);
  });

  test('400s when required fields are missing', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .post('/expenses')
      .set('Authorization', auth(token))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(await prisma.expense.findMany()).toHaveLength(0);
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('400s for an invalid decimal cost', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .post('/expenses')
      .set('Authorization', auth(token))
      .send({ name: 'Shipping', cost: '4.505', materialId: null, description: 'x' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('400s for a non-numeric cost', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .post('/expenses')
      .set('Authorization', auth(token))
      .send({ name: 'Shipping', cost: 'abc', materialId: null, description: 'x' });

    expect(res.status).toBe(400);
  });

  test('400s for a nonexistent material', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .post('/expenses')
      .set('Authorization', auth(token))
      .send({ name: 'Fabric', cost: '19.99', materialId: 999999, description: 'x' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(await prisma.expense.findMany()).toHaveLength(0);
  });

  test('400s for a material belonging to another user and writes nothing', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const catB = await makeCategory(userB.user.id);
    const matB = await makeMaterial(userB.user.id, catB.id);

    const res = await request(app)
      .post('/expenses')
      .set('Authorization', auth(userA.token))
      .send({ name: 'Fabric', cost: '19.99', materialId: matB.id, description: 'x' });

    expect(res.status).toBe(400);
    expect(await prisma.expense.findMany()).toHaveLength(0);
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });
});

describe('PATCH /expenses/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('updates fields and logs the new amount', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const expense = await makeExpense(user.id, { cost: '10.00' });

    const res = await request(app)
      .patch(`/expenses/${expense.id}`)
      .set('Authorization', auth(token))
      .send({ name: 'Fabric order v2', cost: '15.00', description: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.cost.toString()).toBe('15');

    const logs = await prisma.financialLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].amount.toString()).toBe('15');
  });

  test('partial update leaves other fields untouched', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const expense = await makeExpense(user.id, { cost: '10.00', description: 'old' });

    const res = await request(app)
      .patch(`/expenses/${expense.id}`)
      .set('Authorization', auth(token))
      .send({ name: 'Renamed' });

    expect(res.status).toBe(200);

    const updated = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(updated.name).toBe('Renamed');
    expect(updated.cost.toString()).toBe('10');
    expect(updated.description).toBe('old');

    const logs = await prisma.financialLog.findMany();
    expect(logs[0].amount.toString()).toBe('10');
  });

  test('ignores materialId when it is sent', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const a = await makeMaterial(user.id, cat.id, { name: 'Cotton' });
    const b = await makeMaterial(user.id, cat.id, { name: 'Linen' });
    const expense = await makeExpense(user.id, { materialId: a.id });

    const res = await request(app)
      .patch(`/expenses/${expense.id}`)
      .set('Authorization', auth(token))
      .send({ name: 'Renamed', materialId: b.id });

    expect(res.status).toBe(200);

    const updated = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(updated.materialId).toBe(a.id);
  });

  test('400s for an empty body', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const expense = await makeExpense(user.id);

    const res = await request(app)
      .patch(`/expenses/${expense.id}`)
      .set('Authorization', auth(token))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('400s for a non-numeric id', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .patch('/expenses/abc')
      .set('Authorization', auth(token))
      .send({ name: 'x' });

    expect(res.status).toBe(400);
  });

  test('404s for one that does not exist', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .patch('/expenses/999999')
      .set('Authorization', auth(token))
      .send({ name: 'x' });

    expect(res.status).toBe(404);
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('404s when editing another user\'s expense and writes nothing', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const expenseB = await makeExpense(userB.user.id, { name: 'Theirs', cost: '5.00' });

    const res = await request(app)
      .patch(`/expenses/${expenseB.id}`)
      .set('Authorization', auth(userA.token))
      .send({ name: 'Hijacked', cost: '99.00' });

    expect(res.status).toBe(404);

    const untouched = await prisma.expense.findUnique({ where: { id: expenseB.id } });
    expect(untouched.name).toBe('Theirs');
    expect(untouched.cost.toString()).toBe('5');
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('400s for an invalid cost', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const expense = await makeExpense(user.id);

    const res = await request(app)
      .patch(`/expenses/${expense.id}`)
      .set('Authorization', auth(token))
      .send({ cost: '10.005' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('400s for an empty name', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const expense = await makeExpense(user.id);

    const res = await request(app)
      .patch(`/expenses/${expense.id}`)
      .set('Authorization', auth(token))
      .send({ name: '' });

    expect(res.status).toBe(400);
  });

  test('does not affect other expenses', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const a = await makeExpense(user.id, { name: 'A', cost: '1.00' });
    const b = await makeExpense(user.id, { name: 'B', cost: '2.00' });

    await request(app)
      .patch(`/expenses/${a.id}`)
      .set('Authorization', auth(token))
      .send({ name: 'Renamed' });

    const untouched = await prisma.expense.findUnique({ where: { id: b.id } });
    expect(untouched.name).toBe('B');
    expect(untouched.cost.toString()).toBe('2');
  });
});

describe('DELETE /expenses/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('deletes the expense and logs the amount', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const expense = await makeExpense(user.id, { cost: '12.34' });

    const res = await request(app)
      .delete(`/expenses/${expense.id}`)
      .set('Authorization', auth(token));

    expect(res.status).toBe(200);
    expect(await prisma.expense.findMany()).toHaveLength(0);

    const logs = await prisma.financialLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].amount.toString()).toBe('12.34');
    expect(logs[0].type).toBe('expense');
    expect(logs[0].action).toContain(String(expense.id));
  });

  test('404s for one that does not exist', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .delete('/expenses/999999')
      .set('Authorization', auth(token));

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('404s when deleting another user\'s expense and leaves it in place', async () => {
    const userA = await makeAuthedUser('user 1');
    const userB = await makeAuthedUser('user 2');

    const expenseB = await makeExpense(userB.user.id, { cost: '12.34' });

    const res = await request(app)
      .delete(`/expenses/${expenseB.id}`)
      .set('Authorization', auth(userA.token));

    expect(res.status).toBe(404);

    const survivors = await prisma.expense.findMany();
    expect(survivors).toHaveLength(1);
    expect(survivors[0].id).toBe(expenseB.id);
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('400s for a non-numeric id', async () => {
    const { token } = await makeAuthedUser('user 1');

    const res = await request(app)
      .delete('/expenses/abc')
      .set('Authorization', auth(token));

    expect(res.status).toBe(400);
  });

  test('leaves the linked material intact', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id, { quantity: '10' });
    const expense = await makeExpense(user.id, { materialId: mat.id });

    await request(app)
      .delete(`/expenses/${expense.id}`)
      .set('Authorization', auth(token));

    const material = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(material).not.toBeNull();
    expect(material.quantity.toString()).toBe('10');
  });

  test('does not affect other expenses', async () => {
    const { user, token } = await makeAuthedUser('user 1');
    const a = await makeExpense(user.id, { name: 'A' });
    const b = await makeExpense(user.id, { name: 'B' });

    await request(app)
      .delete(`/expenses/${a.id}`)
      .set('Authorization', auth(token));

    const remaining = await prisma.expense.findMany();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(b.id);
  });
});