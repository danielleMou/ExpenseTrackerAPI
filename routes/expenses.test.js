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

async function makeExpense(userId, overrides = {}) {
  return prisma.expense.create({
    data: {
      name: 'Fabric order', cost: '19.99', description: 'Spring restock',
      userId, ...overrides
    }
  });
}

describe('GET /expenses', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns an empty array when there are none', async () => {
    const res = await request(app).get('/expenses');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns all expenses', async () => {
    const user = await makeUser();
    await makeExpense(user.id, { name: 'Fabric order' });
    await makeExpense(user.id, { name: 'Shipping' });

    const res = await request(app).get('/expenses');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe('POST /expenses', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('creates an expense linked to a material and writes a log', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    const res = await request(app)
      .post('/expenses')
      .send({
        name: 'Fabric order',
        cost: '19.99',
        materialId: mat.id,
        description: 'Spring restock',
        userId: user.id
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
    const user = await makeUser();

    const res = await request(app)
      .post('/expenses')
      .send({
        name: 'Shipping',
        cost: '4.50',
        materialId: null,
        description: 'Postage',
        userId: user.id
      });

    expect(res.status).toBe(201);
    expect(res.body.materialId).toBeNull();
    expect(await prisma.financialLog.findMany()).toHaveLength(1);
  });

  test('400s when required fields are missing', async () => {
    const res = await request(app).post('/expenses').send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(await prisma.expense.findMany()).toHaveLength(0);
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('400s for an invalid decimal cost', async () => {
    const user = await makeUser();

    const res = await request(app)
      .post('/expenses')
      .send({ name: 'Shipping', cost: '4.505', materialId: null, description: 'x', userId: user.id });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('400s for a non-numeric cost', async () => {
    const user = await makeUser();

    const res = await request(app)
      .post('/expenses')
      .send({ name: 'Shipping', cost: 'abc', materialId: null, description: 'x', userId: user.id });

    expect(res.status).toBe(400);
  });

  test('400s for a nonexistent material', async () => {
    const user = await makeUser();

    const res = await request(app)
      .post('/expenses')
      .send({ name: 'Fabric', cost: '19.99', materialId: 999999, description: 'x', userId: user.id });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(await prisma.expense.findMany()).toHaveLength(0);
  });

  test('400s for a nonexistent user', async () => {
    const res = await request(app)
      .post('/expenses')
      .send({ name: 'Shipping', cost: '4.50', materialId: null, description: 'x', userId: 999999 });

    expect(res.status).toBe(400);
    expect(await prisma.expense.findMany()).toHaveLength(0);
  });
});

describe('PATCH /expenses/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('updates fields and logs the new amount', async () => {
    const user = await makeUser();
    const expense = await makeExpense(user.id, { cost: '10.00' });

    const res = await request(app)
      .patch(`/expenses/${expense.id}`)
      .send({ name: 'Fabric order v2', cost: '15.00', description: 'Updated', userId: user.id });

    expect(res.status).toBe(200);
    expect(res.body.cost.toString()).toBe('15');

    const logs = await prisma.financialLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].amount.toString()).toBe('15');
  });

  test('partial update leaves other fields untouched', async () => {
    const user = await makeUser();
    const expense = await makeExpense(user.id, { cost: '10.00', description: 'old' });

    const res = await request(app)
      .patch(`/expenses/${expense.id}`)
      .send({ name: 'Renamed', userId: user.id });

    expect(res.status).toBe(200);

    const updated = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(updated.name).toBe('Renamed');
    expect(updated.cost.toString()).toBe('10');
    expect(updated.description).toBe('old');

    const logs = await prisma.financialLog.findMany();
    expect(logs[0].amount.toString()).toBe('10');
  });

  test('ignores materialId when it is sent', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const a = await makeMaterial(user.id, cat.id, { name: 'Cotton' });
    const b = await makeMaterial(user.id, cat.id, { name: 'Linen' });
    const expense = await makeExpense(user.id, { materialId: a.id });

    const res = await request(app)
      .patch(`/expenses/${expense.id}`)
      .send({ name: 'Renamed', materialId: b.id, userId: user.id });

    expect(res.status).toBe(200);

    const updated = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(updated.materialId).toBe(a.id);
  });

  test('400s for an empty body', async () => {
    const user = await makeUser();
    const expense = await makeExpense(user.id);

    const res = await request(app).patch(`/expenses/${expense.id}`).send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('400s for a non-numeric id', async () => {
    const res = await request(app).patch('/expenses/abc').send({ name: 'x' });
    expect(res.status).toBe(400);
  });

  test('404s for one that does not exist', async () => {
    const user = await makeUser();

    const res = await request(app)
      .patch('/expenses/999999')
      .send({ name: 'x', userId: user.id });

    expect(res.status).toBe(404);
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('400s for an invalid cost', async () => {
    const user = await makeUser();
    const expense = await makeExpense(user.id);

    const res = await request(app)
      .patch(`/expenses/${expense.id}`)
      .send({ cost: '10.005', userId: user.id });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('400s for an empty name', async () => {
    const user = await makeUser();
    const expense = await makeExpense(user.id);

    const res = await request(app)
      .patch(`/expenses/${expense.id}`)
      .send({ name: '', userId: user.id });

    expect(res.status).toBe(400);
  });

  test('does not affect other expenses', async () => {
    const user = await makeUser();
    const a = await makeExpense(user.id, { name: 'A', cost: '1.00' });
    const b = await makeExpense(user.id, { name: 'B', cost: '2.00' });

    await request(app).patch(`/expenses/${a.id}`).send({ name: 'Renamed', userId: user.id });

    const untouched = await prisma.expense.findUnique({ where: { id: b.id } });
    expect(untouched.name).toBe('B');
    expect(untouched.cost.toString()).toBe('2');
  });
});

describe('DELETE /expenses/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('deletes the expense and logs the amount', async () => {
    const user = await makeUser();
    const expense = await makeExpense(user.id, { cost: '12.34' });

    const res = await request(app)
      .delete(`/expenses/${expense.id}`)
      .send({ userId: user.id });

    expect(res.status).toBe(200);
    expect(await prisma.expense.findMany()).toHaveLength(0);

    const logs = await prisma.financialLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].amount.toString()).toBe('12.34');
    expect(logs[0].type).toBe('expense');
    expect(logs[0].action).toContain(String(expense.id));
  });

  test('404s for one that does not exist', async () => {
    const user = await makeUser();

    const res = await request(app)
      .delete('/expenses/999999')
      .send({ userId: user.id });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('400s for a non-numeric id', async () => {
    const res = await request(app).delete('/expenses/abc').send({});
    expect(res.status).toBe(400);
  });

  test('leaves the linked material intact', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id, { quantity: '10' });
    const expense = await makeExpense(user.id, { materialId: mat.id });

    await request(app).delete(`/expenses/${expense.id}`).send({ userId: user.id });

    const material = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(material).not.toBeNull();
    expect(material.quantity.toString()).toBe('10');
  });

  test('does not affect other expenses', async () => {
    const user = await makeUser();
    const a = await makeExpense(user.id, { name: 'A' });
    const b = await makeExpense(user.id, { name: 'B' });

    await request(app).delete(`/expenses/${a.id}`).send({ userId: user.id });

    const remaining = await prisma.expense.findMany();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(b.id);
  });
});