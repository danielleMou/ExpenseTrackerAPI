import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import prisma from '../prisma.js';
import resetDatabase from '../tests/resetDatabase.js';
import { createFinishedObject, hideUnsoldFO, updateFinishedObject } from './finishedObjectService.js';

async function makeUser() {
  return prisma.user.create({ data: { username: "user 1", password: "password" } });
}

async function makeCategory(userId, type = 'material', name = 'Fabric') {
  return prisma.category.create({ data: { name, type, userId } });
}

async function makeMaterial(userId, categoryId, { name = 'Cotton', quantity = '10', pricePerUnit = '2.00' } = {}) {
  return prisma.material.create({
    data: { name, unit: 'm', quantity, pricePerUnit, categoryId, userId }
  });
}

async function makeFoCategory(userId, name = 'Bags', type = 'finishedObject') {
  return prisma.category.create({ data: { name, type, userId } });
}

async function makeFO(userId, categoryId, overrides = {}) {
  return prisma.finishedObject.create({
    data: {
      name: 'Tote',
      description: 'A canvas tote',
      askingPrice: '25.00',
      status: 'unlisted',
      isProcessed: false,
      isDeleted: false,
      productionCost: '6.00',
      categoryId,
      userId,
      ...overrides
    }
  });
}

describe('createFinishedObject', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('creates an FO with correct fields and production cost', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const matCat = await makeCategory(user.id, 'material');
    const mat = await makeMaterial(user.id, matCat.id, { quantity: '10', pricePerUnit: '2.00' });

    await createFinishedObject('Tote', 'A canvas tote', cat.id, '25.00', user.id, [
      { materialId: mat.id, quantityUsed: '3' }
    ]);

    const fos = await prisma.finishedObject.findMany();
    expect(fos).toHaveLength(1);
    expect(fos[0].name).toBe('Tote');
    expect(fos[0].description).toBe('A canvas tote');
    expect(fos[0].status).toBe('unlisted');
    expect(fos[0].isProcessed).toBe(false);
    expect(fos[0].askingPrice.toString()).toBe('25');
    expect(fos[0].productionCost.toString()).toBe('6');
  });

  test('creates a QuantityUsed row and decrements stock', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const matCat = await makeCategory(user.id, 'material');
    const mat = await makeMaterial(user.id, matCat.id, { quantity: '10' });

    const fo = await createFinishedObject('Tote', null, cat.id, '25.00', user.id, [
      { materialId: mat.id, quantityUsed: '3' }
    ]);

    const qu = await prisma.quantityUsed.findMany();
    expect(qu).toHaveLength(1);
    expect(qu[0].materialId).toBe(mat.id);
    expect(qu[0].FOId).toBe(fo.id);
    expect(qu[0].quantity.toString()).toBe('3');

    const updated = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(updated.quantity.toString()).toBe('7');
  });

  test('handles multiple materials independently', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const matCat = await makeCategory(user.id, 'material');
    const a = await makeMaterial(user.id, matCat.id, { name: 'Cotton', quantity: '10', pricePerUnit: '2.00' });
    const b = await makeMaterial(user.id, matCat.id, { name: 'Linen', quantity: '20', pricePerUnit: '3.50' });
    const c = await makeMaterial(user.id, matCat.id, { name: 'Thread', quantity: '5', pricePerUnit: '0.50' });

    await createFinishedObject('Tote', null, cat.id, '25.00', user.id, [
      { materialId: a.id, quantityUsed: '2' },
      { materialId: b.id, quantityUsed: '4' },
      { materialId: c.id, quantityUsed: '1' }
    ]);

    const fos = await prisma.finishedObject.findMany();
    expect(fos[0].productionCost.toString()).toBe('18.5');

    expect(await prisma.quantityUsed.findMany()).toHaveLength(3);
    expect(await prisma.stockLog.findMany()).toHaveLength(3);

    expect((await prisma.material.findUnique({ where: { id: a.id } })).quantity.toString()).toBe('8');
    expect((await prisma.material.findUnique({ where: { id: b.id } })).quantity.toString()).toBe('16');
    expect((await prisma.material.findUnique({ where: { id: c.id } })).quantity.toString()).toBe('4');
  });

  test('writes one stock log per material and one FO log', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const matCat = await makeCategory(user.id, 'material');
    const mat = await makeMaterial(user.id, matCat.id);

    const fo = await createFinishedObject('Tote', null, cat.id, '25.00', user.id, [
      { materialId: mat.id, quantityUsed: '3' }
    ]);

    const stockLogs = await prisma.stockLog.findMany();
    expect(stockLogs).toHaveLength(1);
    expect(stockLogs[0].materialId).toBe(mat.id);
    expect(stockLogs[0].action).toContain(String(fo.id));

    const foLogs = await prisma.FOlog.findMany();
    expect(foLogs).toHaveLength(1);
    expect(foLogs[0].FOId).toBe(fo.id);
  });

  test('allows consuming the exact remaining stock', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const matCat = await makeCategory(user.id, 'material');
    const mat = await makeMaterial(user.id, matCat.id, { quantity: '10' });

    await createFinishedObject('Tote', null, cat.id, '25.00', user.id, [
      { materialId: mat.id, quantityUsed: '10' }
    ]);

    const updated = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(updated.quantity.toString()).toBe('0');
  });

  test('handles fractional quantities', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const matCat = await makeCategory(user.id, 'material');
    const mat = await makeMaterial(user.id, matCat.id, { quantity: '10', pricePerUnit: '3.33' });

    await createFinishedObject('Tote', null, cat.id, '25.00', user.id, [
      { materialId: mat.id, quantityUsed: '2.5' }
    ]);

    const fos = await prisma.finishedObject.findMany();
    expect(fos[0].productionCost.toString()).toBe('8.33');

    const updated = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(updated.quantity.toString()).toBe('7.5');
  });

  test('rejects when stock is insufficient across a digit boundary', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const matCat = await makeCategory(user.id, 'material');
    const mat = await makeMaterial(user.id, matCat.id, { quantity: '9' });

    await expect(
      createFinishedObject('Tote', null, cat.id, '25.00', user.id, [
        { materialId: mat.id, quantityUsed: '10' }
      ])
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

    expect(await prisma.finishedObject.findMany()).toHaveLength(0);
    const untouched = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(untouched.quantity.toString()).toBe('9');
  });

  test('rejects insufficient stock and writes nothing', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const matCat = await makeCategory(user.id, 'material');
    const mat = await makeMaterial(user.id, matCat.id, { quantity: '2' });

    await expect(
      createFinishedObject('Tote', null, cat.id, '25.00', user.id, [
        { materialId: mat.id, quantityUsed: '5' }
      ])
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

    expect(await prisma.finishedObject.findMany()).toHaveLength(0);
    expect(await prisma.quantityUsed.findMany()).toHaveLength(0);
    expect(await prisma.stockLog.findMany()).toHaveLength(0);
  });

  test('rejects a nonexistent material and writes nothing', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');

    await expect(
      createFinishedObject('Tote', null, cat.id, '25.00', user.id, [
        { materialId: 999999, quantityUsed: '1' }
      ])
    ).rejects.toMatchObject({ code: 'MATERIAL_NONEXISTENT' });

    expect(await prisma.finishedObject.findMany()).toHaveLength(0);
  });
  
  test('leaves the first material untouched when a later one fails', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const matCat = await makeCategory(user.id, 'material');
    const good = await makeMaterial(user.id, matCat.id, { name: 'Cotton', quantity: '10' });
    const short = await makeMaterial(user.id, matCat.id, { name: 'Linen', quantity: '1' });

    await expect(
      createFinishedObject('Tote', null, cat.id, '25.00', user.id, [
        { materialId: good.id, quantityUsed: '2' },
        { materialId: short.id, quantityUsed: '5' }
      ])
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

    const untouched = await prisma.material.findUnique({ where: { id: good.id } });
    expect(untouched.quantity.toString()).toBe('10');
  });

  test('rejects an empty materials array', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');

    await expect(
      createFinishedObject('Tote', null, cat.id, '25.00', user.id, [])
    ).rejects.toThrow();

    expect(await prisma.finishedObject.findMany()).toHaveLength(0);
  });

  test('rolls back everything when a later write fails', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const matCat = await makeCategory(user.id, 'material');
    const mat = await makeMaterial(user.id, matCat.id, { quantity: '10' });

    await expect(
      createFinishedObject('Tote', null, cat.id, '25.00', 999999, [
        { materialId: mat.id, quantityUsed: '3' }
      ])
    ).rejects.toThrow();

    expect(await prisma.finishedObject.findMany()).toHaveLength(0);
    expect(await prisma.quantityUsed.findMany()).toHaveLength(0);
    const untouched = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(untouched.quantity.toString()).toBe('10');
  });
});

describe('hideUnsoldFO', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('sets isDeleted and writes an FO log', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const fo = await makeFO(user.id, cat.id);

    await hideUnsoldFO(fo.id, user.id);

    const updated = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(updated.isDeleted).toBe(true);

    const logs = await prisma.FOlog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].FOId).toBe(fo.id);
  });

  test('rejects a sold FO and changes nothing', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const fo = await makeFO(user.id, cat.id, { status: 'sold' });

    await expect(hideUnsoldFO(fo.id, user.id)).rejects.toMatchObject({ code: 'FO_SOLD' });

    const updated = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(updated.isDeleted).toBe(false);
    expect(await prisma.FOlog.findMany()).toHaveLength(0);
  });

  test('allows hiding a listed FO', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const fo = await makeFO(user.id, cat.id, { status: 'listed' });

    await hideUnsoldFO(fo.id, user.id);

    const updated = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(updated.isDeleted).toBe(true);
  });

  test('rejects a nonexistent FO', async () => {
    const user = await makeUser();

    await expect(hideUnsoldFO(999999, user.id)).rejects.toMatchObject({ code: 'FO_NONEXISTENT' });
  });

  test('hiding an already-hidden FO succeeds and writes a second log', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const fo = await makeFO(user.id, cat.id, { isDeleted: true });

    await hideUnsoldFO(fo.id, user.id);

    expect(await prisma.FOlog.findMany()).toHaveLength(1);
  });

  test('does not restore material stock', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const matCat = await makeCategory(user.id, 'material');
    const mat = await makeMaterial(user.id, matCat.id, { quantity: '10' });

    const fo = await createFinishedObject('Tote', null, cat.id, '25.00', user.id, [
      { materialId: mat.id, quantityUsed: '3' }
    ]);

    await hideUnsoldFO(fo.id, user.id);

    const updated = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(updated.quantity.toString()).toBe('7');
  });

  test('preserves QuantityUsed rows', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const matCat = await makeCategory(user.id, 'material');
    const mat = await makeMaterial(user.id, matCat.id, { quantity: '10' });

    const fo = await createFinishedObject('Tote', null, cat.id, '25.00', user.id, [
      { materialId: mat.id, quantityUsed: '3' }
    ]);

    await hideUnsoldFO(fo.id, user.id);

    const qu = await prisma.quantityUsed.findMany({ where: { FOId: fo.id } });
    expect(qu).toHaveLength(1);
  });

  test('does not affect other FOs', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, 'finishedObject', 'Bags');
    const a = await makeFO(user.id, cat.id, { name: 'Tote' });
    const b = await makeFO(user.id, cat.id, { name: 'Pouch' });

    await hideUnsoldFO(a.id, user.id);

    const other = await prisma.finishedObject.findUnique({ where: { id: b.id } });
    expect(other.isDeleted).toBe(false);
  });
});

describe('updateFinishedObject', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('updates a single field and leaves the rest untouched', async () => {
    const user = await makeUser();
    const cat = await makeFoCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    await updateFinishedObject(fo.id, 'Large Tote', undefined, undefined, undefined, user.id);

    const updated = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(updated.name).toBe('Large Tote');
    expect(updated.description).toBe('A canvas tote');
    expect(updated.askingPrice.toString()).toBe('25');
    expect(updated.status).toBe('unlisted');
  });

  test('updates multiple fields at once', async () => {
    const user = await makeUser();
    const cat = await makeFoCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    await updateFinishedObject(fo.id, 'Large Tote', 'Now in linen', '32.50', 'listed', user.id);

    const updated = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(updated.name).toBe('Large Tote');
    expect(updated.description).toBe('Now in linen');
    expect(updated.askingPrice.toString()).toBe('32.5');
    expect(updated.status).toBe('listed');
  });

  test('does not change productionCost, isProcessed, isDeleted or categoryId', async () => {
    const user = await makeUser();
    const cat = await makeFoCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    await updateFinishedObject(fo.id, 'Large Tote', 'x', '32.50', 'listed', user.id);

    const updated = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(updated.productionCost.toString()).toBe('6');
    expect(updated.isProcessed).toBe(false);
    expect(updated.isDeleted).toBe(false);
    expect(updated.categoryId).toBe(cat.id);
  });

  test('can set the status to sold, which is how an FO enters the queue', async () => {
    const user = await makeUser();
    const cat = await makeFoCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    await updateFinishedObject(fo.id, undefined, undefined, undefined, 'sold', user.id);

    const updated = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(updated.status).toBe('sold');
    expect(updated.isProcessed).toBe(false);
  });

  test('writes exactly one FO log linked to the object', async () => {
    const user = await makeUser();
    const cat = await makeFoCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    await updateFinishedObject(fo.id, 'Large Tote', undefined, undefined, undefined, user.id);

    const logs = await prisma.FOlog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].FOId).toBe(fo.id);
    expect(logs[0].userId).toBe(user.id);
  });

  test('the log names which fields changed and omits the others', async () => {
    const user = await makeUser();
    const cat = await makeFoCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    await updateFinishedObject(fo.id, 'Large Tote', undefined, '32.50', undefined, user.id);

    const logs = await prisma.FOlog.findMany();
    expect(logs[0].action).toContain('name');
    expect(logs[0].action).toContain('askingPrice');
    expect(logs[0].action).not.toContain('description');
    expect(logs[0].action).not.toContain('status');
  });

  test('the log includes the new values', async () => {
    const user = await makeUser();
    const cat = await makeFoCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    await updateFinishedObject(fo.id, 'Large Tote', undefined, undefined, undefined, user.id);

    const logs = await prisma.FOlog.findMany();
    expect(logs[0].action).toContain('Large Tote');
  });

  test('returns the updated finished object', async () => {
    const user = await makeUser();
    const cat = await makeFoCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    const result = await updateFinishedObject(fo.id, 'Large Tote', undefined, undefined, undefined, user.id);

    expect(result.name).toBe('Large Tote');
  });

  test('throws FO_NONEXISTENT and writes no log', async () => {
    const user = await makeUser();

    await expect(
      updateFinishedObject(999999, 'Large Tote', undefined, undefined, undefined, user.id)
    ).rejects.toMatchObject({ code: 'FO_NONEXISTENT' });

    expect(await prisma.FOlog.findMany()).toHaveLength(0);
  });

  test('rolls back the update when the log write fails', async () => {
    const user = await makeUser();
    const cat = await makeFoCategory(user.id);
    const fo = await makeFO(user.id, cat.id);

    await expect(
      updateFinishedObject(fo.id, 'Large Tote', undefined, undefined, undefined, 999999)
    ).rejects.toThrow();

    const untouched = await prisma.finishedObject.findUnique({ where: { id: fo.id } });
    expect(untouched.name).toBe('Tote');
  });

  test('does not affect other finished objects', async () => {
    const user = await makeUser();
    const cat = await makeFoCategory(user.id);
    const a = await makeFO(user.id, cat.id, { name: 'Tote' });
    const b = await makeFO(user.id, cat.id, { name: 'Pouch' });

    await updateFinishedObject(a.id, 'Large Tote', undefined, undefined, undefined, user.id);

    const untouched = await prisma.finishedObject.findUnique({ where: { id: b.id } });
    expect(untouched.name).toBe('Pouch');
    expect(await prisma.FOlog.findMany()).toHaveLength(1);
  });

});
