import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import prisma from '../prisma.js';
import resetDatabase from '../tests/resetDatabase.js';
import { createExpense, editExpense, deleteExpense, createMoneyIn, editMoneyIn, deleteMoneyIn} from './financialService.js';

async function makeUser() {
  return prisma.user.create({ data: { username: "user", password: "password" } });
}

async function makeCategory(userId, type = 'material', name = 'Fabric') {
  return prisma.category.create({ data: { name, type, userId } });
}

async function makeMaterial(userId, categoryId) {
  return prisma.material.create({
    data: { name: 'Cotton', unit: 'm', quantity: '10', pricePerUnit: '2.00', categoryId, userId }
  });
}

async function makeFO(userId, categoryId) {
  return prisma.finishedObject.create({
    data: {
      name: 'Tote', askingPrice: '25.00', status: 'unlisted',
      isProcessed: false, productionCost: '6.00', categoryId, userId
    }
  });
}

describe('createExpense', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('creates an expense and a financial log', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    await createExpense('Fabric order', '19.99', mat.id, 'Spring restock', user.id);

    const expenses = await prisma.expense.findMany();
    expect(expenses).toHaveLength(1);
    expect(expenses[0].name).toBe('Fabric order');
    expect(expenses[0].cost.toString()).toBe('19.99');
    expect(expenses[0].materialId).toBe(mat.id);
    expect(expenses[0].description).toBe('Spring restock');
    expect(expenses[0].userId).toBe(user.id);

    const logs = await prisma.financialLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('expense');
    expect(logs[0].amount.toString()).toBe('19.99');
    expect(logs[0].userId).toBe(user.id);
  });

  test('creates a standalone expense with no material link', async () => {
    const user = await makeUser();

    await createExpense('Shipping', '4.50', null, 'Postage', user.id);

    const expenses = await prisma.expense.findMany();
    expect(expenses).toHaveLength(1);
    expect(expenses[0].materialId).toBeNull();
    expect(await prisma.financialLog.findMany()).toHaveLength(1);
  });

  test('rolls back when the log write fails', async () => {
    const user = await makeUser();

    await expect(
      createExpense('Shipping', '4.50', null, 'Postage', 999999)
    ).rejects.toThrow();

    expect(await prisma.expense.findMany()).toHaveLength(0);
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('rejects a nonexistent material link', async () => {
    const user = await makeUser();

    await expect(
      createExpense('Fabric', '19.99', 999999, 'x', user.id)
    ).rejects.toThrow();

    expect(await prisma.expense.findMany()).toHaveLength(0);
  });
});

describe('editExpense', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  async function seed() {
    const user = await makeUser();
    const expense = await prisma.expense.create({
      data: { name: 'Fabric', cost: '10.00', description: 'old', userId: user.id }
    });
    return { user, expense };
  }

  test('updates fields and logs the new amount', async () => {
    const { user, expense } = await seed();

    await editExpense(expense.id, 'Fabric v2', '15.00', 'new', user.id);

    const updated = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(updated.name).toBe('Fabric v2');
    expect(updated.cost.toString()).toBe('15');
    expect(updated.description).toBe('new');

    const logs = await prisma.financialLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].amount.toString()).toBe('15');
    expect(logs[0].type).toBe('expense');
  });

  test('partial update leaves other fields untouched and logs the current cost', async () => {
    const { user, expense } = await seed();

    await editExpense(expense.id, 'Renamed', undefined, undefined, user.id);

    const updated = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(updated.name).toBe('Renamed');
    expect(updated.cost.toString()).toBe('10');
    expect(updated.description).toBe('old');

    const logs = await prisma.financialLog.findMany();
    expect(logs[0].amount.toString()).toBe('10');
  });

  test('does not relink the material', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);
    const expense = await prisma.expense.create({
      data: { name: 'Fabric', cost: '10.00', description: 'x', materialId: mat.id, userId: user.id }
    });

    await editExpense(expense.id, 'Renamed', undefined, undefined, user.id);

    const updated = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(updated.materialId).toBe(mat.id);
  });

  test('rejects a nonexistent expense and writes no log', async () => {
    const user = await makeUser();

    await expect(
      editExpense(999999, 'x', '1.00', 'y', user.id)
    ).rejects.toThrow();

    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('does not affect other expenses', async () => {
    const { user, expense } = await seed();
    const other = await prisma.expense.create({
      data: { name: 'Other', cost: '99.00', description: 'z', userId: user.id }
    });

    await editExpense(expense.id, 'Renamed', undefined, undefined, user.id);

    const untouched = await prisma.expense.findUnique({ where: { id: other.id } });
    expect(untouched.name).toBe('Other');
    expect(untouched.cost.toString()).toBe('99');
  });
});

describe('deleteExpense', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('deletes the expense and logs the deleted amount', async () => {
    const user = await makeUser();
    const expense = await prisma.expense.create({
      data: { name: 'Fabric', cost: '12.34', description: 'x', userId: user.id }
    });

    await deleteExpense(expense.id, user.id);

    expect(await prisma.expense.findMany()).toHaveLength(0);

    const logs = await prisma.financialLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].amount.toString()).toBe('12.34');
    expect(logs[0].type).toBe('expense');
    expect(logs[0].action).toContain(String(expense.id));
  });

  test('throws EXPENSE_NONEXISTENT and writes nothing', async () => {
    const user = await makeUser();

    await expect(
      deleteExpense(999999, user.id)
    ).rejects.toMatchObject({ code: 'EXPENSE_NONEXISTENT' });

    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('leaves the linked material intact', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);
    const expense = await prisma.expense.create({
      data: { name: 'Fabric', cost: '10.00', description: 'x', materialId: mat.id, userId: user.id }
    });

    await deleteExpense(expense.id, user.id);

    const material = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(material).not.toBeNull();
    expect(material.quantity.toString()).toBe('10');
  });

  test('does not affect other expenses', async () => {
    const user = await makeUser();
    const a = await prisma.expense.create({
      data: { name: 'A', cost: '1.00', description: 'x', userId: user.id }
    });
    const b = await prisma.expense.create({
      data: { name: 'B', cost: '2.00', description: 'y', userId: user.id }
    });

    await deleteExpense(a.id, user.id);

    expect(await prisma.expense.findMany()).toHaveLength(1);
    expect((await prisma.expense.findMany())[0].id).toBe(b.id);
  });
});

describe('createMoneyIn', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('creates a money in record linked to an FO and logs it', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const fo = await makeFO(user.id, cat.id);

    await createMoneyIn('Tote sale', '30.00', 'Etsy', user.id, fo.id);

    const rows = await prisma.moneyIn.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Tote sale');
    expect(rows[0].amount.toString()).toBe('30');
    expect(rows[0].FOId).toBe(fo.id);

    const logs = await prisma.financialLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('money in');
    expect(logs[0].amount.toString()).toBe('30');
  });

  test('creates a standalone money in with no FO link', async () => {
    const user = await makeUser();

    await createMoneyIn('Investment', '500.00', 'Startup float', user.id, null);

    const rows = await prisma.moneyIn.findMany();
    expect(rows[0].FOId).toBeNull();
    expect(await prisma.financialLog.findMany()).toHaveLength(1);
  });

  // NOTE: this asserts the CURRENT return value, which is the transaction result,
  // not the created row — check whether that is what you want.
  test('rolls back when the log write fails', async () => {
    const user = await makeUser();

    await expect(
      createMoneyIn('Investment', '500.00', 'x', 999999, null)
    ).rejects.toThrow();

    expect(await prisma.moneyIn.findMany()).toHaveLength(0);
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });
});

describe('editMoneyIn', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  async function seed() {
    const user = await makeUser();
    const row = await prisma.moneyIn.create({
      data: { name: 'Sale', amount: '30.00', description: 'old', userId: user.id }
    });
    return { user, row };
  }

  test('updates fields and logs the new amount', async () => {
    const { user, row } = await seed();

    await editMoneyIn(row.id, 'Sale v2', '45.00', 'new', user.id);

    const updated = await prisma.moneyIn.findUnique({ where: { id: row.id } });
    expect(updated.name).toBe('Sale v2');
    expect(updated.amount.toString()).toBe('45');

    const logs = await prisma.financialLog.findMany();
    expect(logs[0].amount.toString()).toBe('45');
    expect(logs[0].type).toBe('money in');
  });

  test('partial update logs the current amount', async () => {
    const { user, row } = await seed();

    await editMoneyIn(row.id, 'Renamed', undefined, undefined, user.id);

    const updated = await prisma.moneyIn.findUnique({ where: { id: row.id } });
    expect(updated.amount.toString()).toBe('30');

    const logs = await prisma.financialLog.findMany();
    expect(logs[0].amount.toString()).toBe('30');
  });

  test('does not relink the finished object', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const fo = await makeFO(user.id, cat.id);
    const row = await prisma.moneyIn.create({
      data: { name: 'Sale', amount: '30.00', description: 'x', FOId: fo.id, userId: user.id }
    });

    await editMoneyIn(row.id, 'Renamed', undefined, undefined, user.id);

    const updated = await prisma.moneyIn.findUnique({ where: { id: row.id } });
    expect(updated.FOId).toBe(fo.id);
  });

  test('rejects a nonexistent record and writes no log', async () => {
    const user = await makeUser();

    await expect(
      editMoneyIn(999999, 'x', '1.00', 'y', user.id)
    ).rejects.toThrow();

    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });
});

describe('deleteMoneyIn', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('deletes the record and logs the deleted amount', async () => {
    const user = await makeUser();
    const row = await prisma.moneyIn.create({
      data: { name: 'Sale', amount: '30.00', description: 'x', userId: user.id }
    });

    await deleteMoneyIn(row.id, user.id);

    expect(await prisma.moneyIn.findMany()).toHaveLength(0);

    const logs = await prisma.financialLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].amount.toString()).toBe('30');
    expect(logs[0].type).toBe('money in');
    expect(logs[0].action).toContain(String(row.id));
  });

  test('throws MONEY_IN_NONEXISTENT and writes nothing', async () => {
    const user = await makeUser();

    await expect(
      deleteMoneyIn(999999, user.id)
    ).rejects.toMatchObject({ code: 'MONEY_IN_NONEXISTENT' });

    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  // documents the decision: the FO is NOT reverted, the user must do it manually
  test('leaves the linked FO marked sold', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const fo = await prisma.finishedObject.create({
      data: {
        name: 'Tote', askingPrice: '25.00', status: 'sold', isProcessed: true,
        productionCost: '6.00', categoryId: cat.id, userId: user.id
      }
    });
    const row = await prisma.moneyIn.create({
      data: { name: 'Sale', amount: '30.00', description: 'x', FOId: fo.id, userId: user.id }
    });

    await deleteMoneyIn(row.id, user.id);

    const updated = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(updated.status).toBe('sold');
    expect(updated.isProcessed).toBe(true);
  });

  test('does not affect other records', async () => {
    const user = await makeUser();
    const a = await prisma.moneyIn.create({
      data: { name: 'A', amount: '1.00', description: 'x', userId: user.id }
    });
    const b = await prisma.moneyIn.create({
      data: { name: 'B', amount: '2.00', description: 'y', userId: user.id }
    });

    await deleteMoneyIn(a.id, user.id);

    const remaining = await prisma.moneyIn.findMany();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(b.id);
  });
});