import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import prisma from '../prisma.js';
import resetDatabase from './resetDatabase.js';

describe('Check test database is working', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('can write and read a user', async () => {
    await prisma.user.create({ data: { username: "user 1", password: "placeholder" } });
    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
  });
});