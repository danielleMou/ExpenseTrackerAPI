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

async function makeFO(userId, categoryId, overrides = {}) {
  return prisma.finishedObject.create({
    data: {
      name: 'Tote', description: 'A canvas tote', askingPrice: '25.00',
      status: 'unlisted', isProcessed: false, isDeleted: false,
      productionCost: '6.00', categoryId, userId, ...overrides
    }
  });
}

async function makeMoneyIn(userId, overrides = {}) {
  return prisma.moneyIn.create({
    data: {
      name: 'Tote sale', amount: '30.00', description: 'Etsy',
      userId, ...overrides
    }
  });
}

describe('GET /moneyIn', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns an empty array when there are none', async () => {
    const res = await request(app).get('/moneyIn');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns all money in records', async () => {
    const user = await makeUser();
    await makeMoneyIn(user.id, { name: 'Tote sale' });
    await makeMoneyIn(user.id, { name: 'Investment' });

    const res = await request(app).get('/moneyIn');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe('POST /moneyIn', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('creates a record linked to an FO and writes a log', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    const res = await request(app)
      .post('/moneyIn')
      .send({
        name: 'Tote sale',
        amount: '30.00',
        description: 'Etsy',
        finishedObjectId: fo.id,
        userId: user.id
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Tote sale');
    expect(res.body.FOId).toBe(fo.id);

    expect(await prisma.moneyIn.findMany()).toHaveLength(1);

    const logs = await prisma.financialLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('money in');
    expect(logs[0].amount.toString()).toBe('30');
  });

  test('creates a standalone record with no FO link', async () => {
    const user = await makeUser();

    const res = await request(app)
      .post('/moneyIn')
      .send({
        name: 'Investment',
        amount: '500.00',
        description: 'Startup float',
        finishedObjectId: null,
        userId: user.id
      });

    expect(res.status).toBe(201);
    expect(res.body.FOId).toBeNull();
    expect(await prisma.financialLog.findMany()).toHaveLength(1);
  });

  test('400s when required fields are missing', async () => {
    const res = await request(app).post('/moneyIn').send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(await prisma.moneyIn.findMany()).toHaveLength(0);
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('400s for an invalid decimal amount', async () => {
    const user = await makeUser();

    const res = await request(app)
      .post('/moneyIn')
      .send({ name: 'Sale', amount: '30.005', description: 'x', finishedObjectId: null, userId: user.id });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('400s for a non-numeric amount', async () => {
    const user = await makeUser();

    const res = await request(app)
      .post('/moneyIn')
      .send({ name: 'Sale', amount: 'abc', description: 'x', finishedObjectId: null, userId: user.id });

    expect(res.status).toBe(400);
  });

  test('400s for a nonexistent finished object', async () => {
    const user = await makeUser();

    const res = await request(app)
      .post('/moneyIn')
      .send({ name: 'Sale', amount: '30.00', description: 'x', finishedObjectId: 999999, userId: user.id });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(await prisma.moneyIn.findMany()).toHaveLength(0);
  });

  test('400s for a nonexistent user', async () => {
    const res = await request(app)
      .post('/moneyIn')
      .send({ name: 'Sale', amount: '30.00', description: 'x', finishedObjectId: null, userId: 999999 });

    expect(res.status).toBe(400);
    expect(await prisma.moneyIn.findMany()).toHaveLength(0);
  });
});

describe('PATCH /moneyIn/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('updates fields and logs the new amount', async () => {
    const user = await makeUser();
    const row = await makeMoneyIn(user.id, { amount: '30.00' });

    const res = await request(app)
      .patch(`/moneyIn/${row.id}`)
      .send({ name: 'Tote sale v2', amount: '45.00', description: 'Updated', userId: user.id });

    expect(res.status).toBe(200);
    expect(res.body.amount.toString()).toBe('45');

    const logs = await prisma.financialLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].amount.toString()).toBe('45');
    expect(logs[0].type).toBe('money in');
  });

  test('partial update leaves other fields untouched', async () => {
    const user = await makeUser();
    const row = await makeMoneyIn(user.id, { amount: '30.00', description: 'old' });

    const res = await request(app)
      .patch(`/moneyIn/${row.id}`)
      .send({ name: 'Renamed', userId: user.id });

    expect(res.status).toBe(200);

    const updated = await prisma.moneyIn.findUnique({ where: { id: row.id } });
    expect(updated.name).toBe('Renamed');
    expect(updated.amount.toString()).toBe('30');
    expect(updated.description).toBe('old');

    const logs = await prisma.financialLog.findMany();
    expect(logs[0].amount.toString()).toBe('30');
  });

  test('ignores finishedObjectId when it is sent', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const a = await makeFO(user.id, cat.id, { name: 'Tote' });
    const b = await makeFO(user.id, cat.id, { name: 'Pouch' });
    const row = await makeMoneyIn(user.id, { FOId: a.id });

    const res = await request(app)
      .patch(`/moneyIn/${row.id}`)
      .send({ name: 'Renamed', finishedObjectId: b.id, userId: user.id });

    expect(res.status).toBe(200);

    const updated = await prisma.moneyIn.findUnique({ where: { id: row.id } });
    expect(updated.FOId).toBe(a.id);
  });

  test('400s for an empty body', async () => {
    const user = await makeUser();
    const row = await makeMoneyIn(user.id);

    const res = await request(app).patch(`/moneyIn/${row.id}`).send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('400s for a non-numeric id', async () => {
    const res = await request(app).patch('/moneyIn/abc').send({ name: 'x' });
    expect(res.status).toBe(400);
  });

  test('404s for one that does not exist', async () => {
    const user = await makeUser();

    const res = await request(app)
      .patch('/moneyIn/999999')
      .send({ name: 'x', userId: user.id });

    expect(res.status).toBe(404);
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('400s for an invalid amount', async () => {
    const user = await makeUser();
    const row = await makeMoneyIn(user.id);

    const res = await request(app)
      .patch(`/moneyIn/${row.id}`)
      .send({ amount: '30.005', userId: user.id });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('400s for an empty name', async () => {
    const user = await makeUser();
    const row = await makeMoneyIn(user.id);

    const res = await request(app)
      .patch(`/moneyIn/${row.id}`)
      .send({ name: '', userId: user.id });

    expect(res.status).toBe(400);
  });

  test('does not affect other records', async () => {
    const user = await makeUser();
    const a = await makeMoneyIn(user.id, { name: 'A', amount: '1.00' });
    const b = await makeMoneyIn(user.id, { name: 'B', amount: '2.00' });

    await request(app).patch(`/moneyIn/${a.id}`).send({ name: 'Renamed', userId: user.id });

    const untouched = await prisma.moneyIn.findUnique({ where: { id: b.id } });
    expect(untouched.name).toBe('B');
    expect(untouched.amount.toString()).toBe('2');
  });
});

describe('DELETE /moneyIn/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('deletes the record and logs the amount', async () => {
    const user = await makeUser();
    const row = await makeMoneyIn(user.id, { amount: '30.00' });

    const res = await request(app)
      .delete(`/moneyIn/${row.id}`)
      .send({ userId: user.id });

    expect(res.status).toBe(200);
    expect(await prisma.moneyIn.findMany()).toHaveLength(0);

    const logs = await prisma.financialLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].amount.toString()).toBe('30');
    expect(logs[0].type).toBe('money in');
    expect(logs[0].action).toContain(String(row.id));
  });

  test('404s for one that does not exist', async () => {
    const user = await makeUser();

    const res = await request(app)
      .delete('/moneyIn/999999')
      .send({ userId: user.id });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('400s for a non-numeric id', async () => {
    const res = await request(app).delete('/moneyIn/abc').send({});
    expect(res.status).toBe(400);
  });

  test('leaves the linked FO marked sold and processed', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id, { status: 'sold', isProcessed: true });
    const row = await makeMoneyIn(user.id, { FOId: fo.id });

    await request(app).delete(`/moneyIn/${row.id}`).send({ userId: user.id });

    const updated = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(updated.status).toBe('sold');
    expect(updated.isProcessed).toBe(true);
  });

  test('does not affect other records', async () => {
    const user = await makeUser();
    const a = await makeMoneyIn(user.id, { name: 'A' });
    const b = await makeMoneyIn(user.id, { name: 'B' });

    await request(app).delete(`/moneyIn/${a.id}`).send({ userId: user.id });

    const remaining = await prisma.moneyIn.findMany();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(b.id);
  });
});