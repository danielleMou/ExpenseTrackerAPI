import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import prisma from '../prisma.js';
import resetDatabase from '../tests/resetDatabase.js';
import { createMaterial, restockMaterial, updateMaterial } from './materialService.js';

async function makeUser() {
  return prisma.user.create({ data: { username: "user", passwordHash: "pass" } });
}

async function makeCategory(userId, name = 'Fabric', type = 'material') {
  return prisma.category.create({ data: { name, type, userId } });
}

async function makeMaterial(userId, categoryId, overrides = {}) {
  return prisma.material.create({
    data: {
      name: 'Cotton',
      unit: 'm',
      quantity: '10',
      pricePerUnit: '2.50',
      categoryId,
      userId,
      ...overrides
    }
  });
}

describe('Create material', () => {
    beforeEach(async () => {
        await resetDatabase();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    test('Create material with expense and logs when quantity > 0', async () => {
        // for a material to be created, a user and a category need to exist
        const user = await prisma.user.create({
            data: { username: "user 1", passwordHash: "password"}
        })
        const category = await prisma.category.create({
            data: { name: "Fabric", type: "material", userId: user.id }
        })

        const result = await createMaterial("linen", "m", 5, 10, category.id, true, user.id);

        const materials = await prisma.material.findMany();

        expect(materials).toHaveLength(1);
        expect(materials[0].name).toBe('linen');
        expect(materials[0].unit).toBe('m');
        expect(materials[0].pricePerUnit.toString()).toBe('5');
        expect(materials[0].quantity.toString()).toBe('10');

        const expenses = await prisma.expense.findMany();
        expect(expenses).toHaveLength(1);
        expect(expenses[0].materialId).toBe(materials[0].id);
        expect(expenses[0].cost.toString()).toBe('50');

        const stockLogs = await prisma.stockLog.findMany();
        expect(stockLogs).toHaveLength(1);
        expect(stockLogs[0].materialId).toBe(materials[0].id);

        const financialLogs = await prisma.financialLog.findMany();
        expect(financialLogs).toHaveLength(1);
    }); 

    test('Create no expense or financial log when quantity is 0', async () => {
        // for a material to be created, a user and a category need to exist
        const user = await prisma.user.create({
            data: { username: "user 1", passwordHash: "password"}
        });
        const category = await prisma.category.create({
            data: { name: "Fabric", type: "material", userId: user.id }
        });

        const result = await createMaterial("linen", "m", 5, 0, category.id, true, user.id);

        const materials = await prisma.material.findMany();

        expect(materials).toHaveLength(1);
        expect(materials[0].name).toBe('linen');
        expect(materials[0].unit).toBe('m');
        expect(materials[0].pricePerUnit.toString()).toBe('5');
        expect(materials[0].quantity.toString()).toBe('0');

        const expenses = await prisma.expense.findMany();
        expect(expenses).toHaveLength(0);

        const stockLogs = await prisma.stockLog.findMany();
        expect(stockLogs).toHaveLength(1);
        expect(stockLogs[0].materialId).toBe(materials[0].id);

        const financialLogs = await prisma.financialLog.findMany();
        expect(financialLogs).toHaveLength(0);
    });

    test('Category does not exists', async () => {
        // for a material to be created, a user and a category need to exist
        const user = await prisma.user.create({
            data: { username: "user 1", passwordHash: "password"}
        });

        await expect(createMaterial("linen", "m", 5, 10, 999, true, user.id)).rejects.toThrow();
        expect(await prisma.material.findMany()).toHaveLength(0);
    });

    test('Rollback', async () => {
        
    });
  
    test('fractional quantities', async () => {
        // for a material to be created, a user and a category need to exist
        const user = await prisma.user.create({
            data: { username: "user 1", passwordHash: "password"}
        });
        const category = await prisma.category.create({
            data: { name: "Fabric", type: "material", userId: user.id }
        });

        const result = await createMaterial("linen", "m", 3.333, 3, category.id, true, user.id);

        const materials = await prisma.material.findMany();

        expect(materials).toHaveLength(1);
        expect(materials[0].name).toBe('linen');
        expect(materials[0].unit).toBe('m');
        expect(materials[0].pricePerUnit.toString()).toBe('3.333');
        expect(materials[0].quantity.toString()).toBe('3');
        expect(materials[0].categoryId.toString()).toBe((category.id).toString());

        const expenses = await prisma.expense.findMany();
        expect(expenses).toHaveLength(1);
        expect(expenses[0].cost.toString()).toBe('10');

        const stockLogs = await prisma.stockLog.findMany();
        expect(stockLogs).toHaveLength(1);
        expect(stockLogs[0].materialId).toBe(materials[0].id);

        const financialLogs = await prisma.financialLog.findMany();
        expect(financialLogs).toHaveLength(1);
    });

    test('fractional quantities 2', async () => {
        // for a material to be created, a user and a category need to exist
        const user = await prisma.user.create({
            data: { username: "user 1", passwordHash: "password"}
        });
        const category = await prisma.category.create({
            data: { name: "Fabric", type: "material", userId: user.id }
        });

        const result = await createMaterial("linen", "m", 3.33, 2.5, category.id, true, user.id);

        const materials = await prisma.material.findMany();

        expect(materials).toHaveLength(1);
        expect(materials[0].name).toBe('linen');
        expect(materials[0].unit).toBe('m');
        expect(materials[0].pricePerUnit.toString()).toBe('3.33');
        expect(materials[0].quantity.toString()).toBe('2.5');
        expect(materials[0].categoryId.toString()).toBe((category.id).toString());

        const expenses = await prisma.expense.findMany();
        expect(expenses).toHaveLength(1);
        expect(expenses[0].cost.toString()).toBe('8.33');

        const stockLogs = await prisma.stockLog.findMany();
        expect(stockLogs).toHaveLength(1);
        expect(stockLogs[0].materialId).toBe(materials[0].id);

        const financialLogs = await prisma.financialLog.findMany();
        expect(financialLogs).toHaveLength(1);
    });

    test('quantity is greater than 0 and create expense is false', async () => {
        // for a material to be created, a user and a category need to exist
        const user = await prisma.user.create({
            data: { username: "user 1", passwordHash: "password"}
        });
        const category = await prisma.category.create({
            data: { name: "Fabric", type: "material", userId: user.id }
        });

        const result = await createMaterial("linen", "m", 3.33, 2.5, category.id, false, user.id);

        const materials = await prisma.material.findMany();

        expect(materials).toHaveLength(1);
        expect(materials[0].name).toBe('linen');
        expect(materials[0].unit).toBe('m');
        expect(materials[0].pricePerUnit.toString()).toBe('3.33');
        expect(materials[0].quantity.toString()).toBe('2.5');
        expect(materials[0].categoryId.toString()).toBe((category.id).toString());

        const expenses = await prisma.expense.findMany();
        expect(expenses).toHaveLength(0);

        const stockLogs = await prisma.stockLog.findMany();
        expect(stockLogs).toHaveLength(1);
        expect(stockLogs[0].materialId).toBe(materials[0].id);

        const financialLogs = await prisma.financialLog.findMany();
        expect(financialLogs).toHaveLength(0);
    });  
})

describe('Restock material', () => {
    beforeEach(async () => {
        await resetDatabase();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    // set up a user, category and a material that will be restocked
    async function setup(quantity, pricePerUnit) {
    const user = await prisma.user.create({
      data: { username: "user 1", passwordHash: "password" }
    });
    const category = await prisma.category.create({
      data: { name: 'Fabric', type: 'material', userId: user.id }
    });
    const material = await prisma.material.create({
      data: {
        name: 'Linen',
        unit: 'm',
        pricePerUnit,
        quantity,
        categoryId: category.id,
        userId: user.id
      }
    });
    return { user, category, material };
  }

  test('incremented stock by updated amount', async () => {
    const { user, material } = await setup('10', '2.50');

    await restockMaterial(material.id, '5', '2.50', false, user.id);

    const updated = await prisma.material.findUnique({ where: { id: material.id } });
    expect(updated.quantity.toString()).toBe('15');
  });

  test('creates an expense for correct amount', async () => {
    const { user, material } = await setup('10', '2.50');

    await restockMaterial(material.id, '5', '2.50', false, user.id);

    const expenses = await prisma.expense.findMany();
    expect(expenses).toHaveLength(1);
    expect(expenses[0].cost.toString()).toBe('12.5');
    expect(expenses[0].materialId).toBe(material.id);
    expect(expenses[0].userId).toBe(user.id);
  });

  test('when flag is false, expense uses price paid', async () => {
    const { user, material } = await setup('10', '2.50');

    await restockMaterial(material.id, '5', '4.00', false, user.id);

    const expenses = await prisma.expense.findMany();
    expect(expenses[0].cost.toString()).toBe('20');

    const updated = await prisma.material.findUnique({ where: { id: material.id } });
    expect(updated.pricePerUnit.toString()).toBe('2.5');
  });

  test('updates the stored price when flag is true', async () => {
    const { user, material } = await setup('10', '2.50');

    await restockMaterial(material.id, '5', '4.00', true, user.id);

    const updated = await prisma.material.findUnique({ where: { id: material.id } });
    expect(updated.pricePerUnit.toString()).toBe('4');

    const expenses = await prisma.expense.findMany();
    expect(expenses[0].cost.toString()).toBe('20');
  });

  test('rounds expense to 2 dp', async () => {
    const { user, material } = await setup('10', '2.50');

    await restockMaterial(material.id, '2.5', '3.33', false, user.id);

    const expenses = await prisma.expense.findMany();
    expect(expenses[0].cost.toString()).toBe('8.33');
  });

  test('writes 1 stock log when the price is not updated', async () => {
    const { user, material } = await setup('10', '2.50');

    await restockMaterial(material.id, '5', '2.50', false, user.id);

    const logs = await prisma.stockLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].materialId).toBe(material.id);
    expect(logs[0].action).toContain(String(material.id));
  });

  test('writes 2 stock logs when the price is updated', async () => {
    const { user, material } = await setup('10', '2.50');

    await restockMaterial(material.id, '5', '4.00', true, user.id);

    const logs = await prisma.stockLog.findMany();
    expect(logs).toHaveLength(2);
  });

  test('does not write a second stock log when the flag is true but price unchanged', async () => {
    const { user, material } = await setup('10', '2.50');

    await restockMaterial(material.id, '5', '2.50', true, user.id);

    const logs = await prisma.stockLog.findMany();
    expect(logs).toHaveLength(1);
  });

  test('writes financial log matching the expense', async () => {
    const { user, material } = await setup('10', '2.50');

    await restockMaterial(material.id, '5', '2.50', false, user.id);

    const logs = await prisma.financialLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].amount.toString()).toBe('12.5');
    expect(logs[0].type).toBe('expense');
    expect(logs[0].userId).toBe(user.id);
  });

  test('does not affect other materials', async () => {
    const { user, category, material } = await setup('10', '2.50');
    const other = await prisma.material.create({
      data: {
        name: 'Linen', unit: 'm', pricePerUnit: '3.00', quantity: '20',
        categoryId: category.id, userId: user.id
      }
    });

    await restockMaterial(material.id, '5', '2.50', false, user.id);

    const untouched = await prisma.material.findUnique({ where: { id: other.id } });
    expect(untouched.quantity.toString()).toBe('20');
  });

  test('throws MATERIAL_NONEXISTANT for an unknown material and does not write anything', async () => {
    const { user } = await setup('10', '2.50');

    await expect(
      restockMaterial(999999, '5', '2.50', false, user.id)
    ).rejects.toMatchObject({ code: 'MATERIAL_NONEXISTENT' });

    expect(await prisma.expense.findMany()).toHaveLength(0);
    expect(await prisma.stockLog.findMany()).toHaveLength(0);
    expect(await prisma.financialLog.findMany()).toHaveLength(0);
  });

  test('throws RESTOCK_BY_0 for zero units', async () => {
    const { user, material } = await setup('10', '2.50');

    await expect(
      restockMaterial(material.id, '0', '2.50', false, user.id)
    ).rejects.toMatchObject({ code: 'RESTOCK_BY_0' });

    const updated = await prisma.material.findUnique({ where: { id: material.id } });
    expect(updated.quantity.toString()).toBe('10');
  });

  test('rollback when a later write fails', async () => {
    const { material } = await setup('10', '2.50');

    await expect(
      restockMaterial(material.id, '5', '2.50', false, 999999)
    ).rejects.toThrow();

    const updated = await prisma.material.findUnique({ where: { id: material.id } });
    expect(updated.quantity.toString()).toBe('10');
    expect(await prisma.expense.findMany()).toHaveLength(0);
  });

});

describe('updateMaterial', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('updates a single field and leaves the rest untouched', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    await updateMaterial(mat.id, 'Organic Cotton', undefined, undefined, undefined, user.id);

    const updated = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(updated.name).toBe('Organic Cotton');
    expect(updated.unit).toBe('m');
    expect(updated.pricePerUnit.toString()).toBe('2.5');
    expect(updated.categoryId).toBe(cat.id);
  });

  test('updates multiple fields at once', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const other = await makeCategory(user.id, 'Thread');
    const mat = await makeMaterial(user.id, cat.id);

    await updateMaterial(mat.id, 'Linen', 'cm', '3.75', other.id, user.id);

    const updated = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(updated.name).toBe('Linen');
    expect(updated.unit).toBe('cm');
    expect(updated.pricePerUnit.toString()).toBe('3.75');
    expect(updated.categoryId).toBe(other.id);
  });

  test('never changes the quantity', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id, { quantity: '10' });

    await updateMaterial(mat.id, 'Linen', 'cm', '3.75', cat.id, user.id);

    const updated = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(updated.quantity.toString()).toBe('10');
  });

  test('writes exactly one stock log linked to the material', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    await updateMaterial(mat.id, 'Linen', undefined, undefined, undefined, user.id);

    const logs = await prisma.stockLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].materialId).toBe(mat.id);
    expect(logs[0].userId).toBe(user.id);
    expect(logs[0].action).toContain(String(mat.id));
  });

  test('the log names which fields changed', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    await updateMaterial(mat.id, 'Linen', 'cm', undefined, undefined, user.id);

    const logs = await prisma.stockLog.findMany();
    expect(logs[0].action).toContain('name');
    expect(logs[0].action).toContain('unit');
    expect(logs[0].action).not.toContain('pricePerUnit');
  });

  test('returns the updated material', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    const result = await updateMaterial(mat.id, 'Linen', undefined, undefined, undefined, user.id);

    expect(result.name).toBe('Linen');
  });

  test('rejects a nonexistent material and writes no log', async () => {
    const user = await makeUser();

    await expect(
      updateMaterial(999999, 'Linen', undefined, undefined, undefined, user.id)
    ).rejects.toThrow();

    expect(await prisma.stockLog.findMany()).toHaveLength(0);
  });

  test('rejects a nonexistent category and changes nothing', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    await expect(
      updateMaterial(mat.id, undefined, undefined, undefined, 999999, user.id)
    ).rejects.toThrow();

    const untouched = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(untouched.categoryId).toBe(cat.id);
    expect(await prisma.stockLog.findMany()).toHaveLength(0);
  });

  test('rolls back the update when the log write fails', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const mat = await makeMaterial(user.id, cat.id);

    await expect(
      updateMaterial(mat.id, 'Linen', undefined, undefined, undefined, 999999)
    ).rejects.toThrow();

    const untouched = await prisma.material.findUnique({ where: { id: mat.id } });
    expect(untouched.name).toBe('Cotton');
  });

  test('does not affect other materials', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);
    const a = await makeMaterial(user.id, cat.id, { name: 'Cotton' });
    const b = await makeMaterial(user.id, cat.id, { name: 'Linen' });

    await updateMaterial(a.id, 'Organic Cotton', undefined, undefined, undefined, user.id);

    const untouched = await prisma.material.findUnique({ where: { id: b.id } });
    expect(untouched.name).toBe('Linen');
    expect(await prisma.stockLog.findMany()).toHaveLength(1);
  });

});