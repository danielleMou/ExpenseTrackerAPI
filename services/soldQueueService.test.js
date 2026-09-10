import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import prisma from '../prisma.js';
import resetDatabase from '../tests/resetDatabase.js';
import { processSoldFo } from './soldQueueService.js';

async function makeUser() {
  return prisma.user.create({ data: { username: 'user', passwordHash: 'pass' } });
}

async function makeCategory(userId, type = 'finishedObject', name = 'Bags') {
  return prisma.category.create({ data: { name, type, userId } });
}

async function makeFO(userId, categoryId, overrides = {}) {
  return prisma.finishedObject.create({
    data: {
      name: 'Tote',
      askingPrice: '25.00',
      status: 'sold',
      isProcessed: false,
      isDeleted: false,
      productionCost: '6.00',
      categoryId,
      userId,
      ...overrides
    }
  });
}

describe('processSoldFo', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('marks the FO processed and creates a money in record', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    await processSoldFo(fo.id, '30.00', [], user.id);

    const updated = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(updated.isProcessed).toBe(true);
    expect(updated.status).toBe('sold');

    const moneyIn = await prisma.moneyIn.findMany();
    expect(moneyIn).toHaveLength(1);
    expect(moneyIn[0].amount.toString()).toBe('30');
    expect(moneyIn[0].FOId).toBe(fo.id);
    expect(moneyIn[0].userId).toBe(user.id);
  });

  test('writes a financial log for the sale', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    await processSoldFo(fo.id, '30.00', [], user.id);

    const logs = await prisma.financialLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('money in');
    expect(logs[0].amount.toString()).toBe('30');
    expect(logs[0].action).toContain(String(fo.id));
  });

  test('creates no expenses when the array is empty', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    await processSoldFo(fo.id, '30.00', [], user.id);

    expect(await prisma.expense.findMany()).toHaveLength(0);
    expect(await prisma.financialLog.findMany()).toHaveLength(1);
  });

  test('creates a single expense with its own log', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    await processSoldFo(fo.id, '30.00', [
      { name: 'Postage', cost: '3.85', description: 'Royal Mail' }
    ], user.id);

    const expenses = await prisma.expense.findMany();
    expect(expenses).toHaveLength(1);
    expect(expenses[0].name).toBe('Postage');
    expect(expenses[0].cost.toString()).toBe('3.85');
    expect(expenses[0].description).toBe('Royal Mail');
    expect(expenses[0].userId).toBe(user.id);

    // one for the sale, one for the expense
    const logs = await prisma.financialLog.findMany();
    expect(logs).toHaveLength(2);
  });

  test('creates multiple expenses with distinguishable logs', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    await processSoldFo(fo.id, '30.00', [
      { name: 'Postage', cost: '3.85', description: 'Royal Mail' },
      { name: 'Etsy fee', cost: '1.95', description: 'Platform cut' },
      { name: 'Packaging', cost: '0.60', description: 'Box and tissue' }
    ], user.id);

    const expenses = await prisma.expense.findMany({ orderBy: { id: 'asc' } });
    expect(expenses).toHaveLength(3);
    expect(expenses.map((e) => e.name)).toEqual(['Postage', 'Etsy fee', 'Packaging']);
    expect(expenses.map((e) => e.cost.toString())).toEqual(['3.85', '1.95', '0.6']);

    const logs = await prisma.financialLog.findMany();
    expect(logs).toHaveLength(4);

    const expenseLogs = logs.filter((l) => l.type === 'expense');
    expect(expenseLogs).toHaveLength(3);
    expect(expenseLogs.some((l) => l.action.includes('Postage'))).toBe(true);
    expect(expenseLogs.some((l) => l.action.includes('Etsy fee'))).toBe(true);
    expect(expenseLogs.some((l) => l.action.includes('Packaging'))).toBe(true);
  });

  test('expense financial logs carry the individual costs', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    await processSoldFo(fo.id, '30.00', [
      { name: 'Postage', cost: '3.85', description: 'x' },
      { name: 'Etsy fee', cost: '1.95', description: 'y' }
    ], user.id);

    const expenseLogs = await prisma.financialLog.findMany({ where: { type: 'expense' } });
    const amounts = expenseLogs.map((l) => l.amount.toString()).sort();
    expect(amounts).toEqual(['1.95', '3.85']);
  });

  test('returns the updated finished object', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    const result = await processSoldFo(fo.id, '30.00', [], user.id);

    expect(result.isProcessed).toBe(true);
  });

  test('rejects a nonexistent FO and writes nothing', async () => {
    const user = await makeUser();

    await expect(
      processSoldFo(999999, '30.00', [], user.id)
    ).rejects.toMatchObject({ code: 'FO_NONEXISTENT' });

    expect(await prisma.moneyIn.findMany()).toHaveLength(0);
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('rejects an already-processed FO and writes nothing', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id, { isProcessed: true });

    await expect(
      processSoldFo(fo.id, '30.00', [], user.id)
    ).rejects.toMatchObject({ code: 'FO_INVALID' });

    expect(await prisma.moneyIn.findMany()).toHaveLength(0);
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('rejects a deleted FO and writes nothing', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id, { isDeleted: true });

    await expect(
      processSoldFo(fo.id, '30.00', [], user.id)
    ).rejects.toMatchObject({ code: 'FO_INVALID' });

    expect(await prisma.moneyIn.findMany()).toHaveLength(0);
  });

  test('rejects an FO that has not been marked sold', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id, { status: 'unlisted' });

    await expect(
      processSoldFo(fo.id, '30.00', [], user.id)
    ).rejects.toMatchObject({ code: 'FO_INVALID' });

    expect(await prisma.moneyIn.findMany()).toHaveLength(0);
    const untouched = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(untouched.isProcessed).toBe(false);
  });

  test('rolls back everything when an expense write fails', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    await expect(
      processSoldFo(fo.id, '30.00', [
        { name: 'Postage', cost: '3.85', description: 'ok' },
        { name: null, cost: '1.95', description: 'this one fails' }
      ], user.id)
    ).rejects.toThrow();

    const untouched = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(untouched.isProcessed).toBe(false);
    expect(await prisma.moneyIn.findMany()).toHaveLength(0);
    expect(await prisma.expense.findMany()).toHaveLength(0);
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('rolls back when the user does not exist', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    await expect(
      processSoldFo(fo.id, '30.00', [], 999999)
    ).rejects.toThrow();

    const untouched = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(untouched.isProcessed).toBe(false);
    expect(await prisma.moneyIn.findMany()).toHaveLength(0);
  });

  test('does not affect other finished objects', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const a = await makeFO(user.id, cat.id, { name: 'Tote' });
    const b = await makeFO(user.id, cat.id, { name: 'Pouch' });

    await processSoldFo(a.id, '30.00', [], user.id);

    const other = await prisma.finishedObject.findUnique({ where: { id: b.id } });
    expect(other.isProcessed).toBe(false);
  });
});