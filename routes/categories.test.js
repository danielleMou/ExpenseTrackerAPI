import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import prisma from '../prisma.js';
import resetDatabase from './tests/resetDatabase.js';

async function makeUser() {
  return prisma.user.create({ data: { username: "user", password: "pass" } });
}

async function makeCategory(userId, overrides = {}) {
  return prisma.category.create({
    data: { name: 'Fabric', type: 'material', userId, ...overrides }
  });
}

describe('GET /categories', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns an empty array when there are none', async () => {
    const res = await request(app).get('/categories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns all categories', async () => {
    const user = await makeUser();
    await makeCategory(user.id, { name: 'Fabric' });
    await makeCategory(user.id, { name: 'Bags', type: 'finishedObject' });

    const res = await request(app).get('/categories');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((c) => c.name).sort()).toEqual(['Bags', 'Fabric']);
  });
});

describe('GET /categories/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns the category', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);

    const res = await request(app).get(`/categories/${cat.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(cat.id);
    expect(res.body.name).toBe('Fabric');
    expect(res.body.type).toBe('material');
  });

  test('404s for one that does not exist', async () => {
    const res = await request(app).get('/categories/999999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('400s for a non-numeric id', async () => {
    const res = await request(app).get('/categories/abc');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('400s for a zero id', async () => {
    const res = await request(app).get('/categories/0');
    expect(res.status).toBe(400);
  });
});

describe('POST /categories', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('creates a category and returns 201', async () => {
    const user = await makeUser();

    const res = await request(app)
      .post('/categories')
      .send({ name: 'Fabric', type: 'material', userId: user.id });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Fabric');
    expect(res.body.type).toBe('material');
    expect(res.body.userId).toBe(user.id);

    expect(await prisma.category.findMany()).toHaveLength(1);
  });

  test('400s with an errors array when the body is empty', async () => {
    const res = await request(app).post('/categories').send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(await prisma.category.findMany()).toHaveLength(0);
  });

  test('400s for an empty name', async () => {
    const user = await makeUser();

    const res = await request(app)
      .post('/categories')
      .send({ name: '', type: 'material', userId: user.id });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('400s for a name over the length limit', async () => {
    const user = await makeUser();

    const res = await request(app)
      .post('/categories')
      .send({ name: 'x'.repeat(101), type: 'material', userId: user.id });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('400s for a missing userId', async () => {
    const res = await request(app)
      .post('/categories')
      .send({ name: 'Fabric', type: 'material' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('400s for a nonexistent userId', async () => {
    const res = await request(app)
      .post('/categories')
      .send({ name: 'Fabric', type: 'material', userId: 999999 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('400s for a type over the length limit', async () => {
    const user = await makeUser();

    const res = await request(app)
      .post('/categories')
      .send({ name: 'Fabric', type: 'x'.repeat(11), userId: user.id });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });
});

describe('PATCH /categories/:id', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await prisma.$disconnect(); });

  test('updates the name', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);

    const res = await request(app)
      .patch(`/categories/${cat.id}`)
      .send({ name: 'Fabrics and Textiles' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Fabrics and Textiles');

    const updated = await prisma.category.findUnique({ where: { id: cat.id } });
    expect(updated.name).toBe('Fabrics and Textiles');
  });

  test('ignores type when it is sent', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id, { type: 'material' });

    const res = await request(app)
      .patch(`/categories/${cat.id}`)
      .send({ name: 'Renamed', type: 'finishedObject' });

    expect(res.status).toBe(200);

    const updated = await prisma.category.findUnique({ where: { id: cat.id } });
    expect(updated.type).toBe('material');
    expect(updated.name).toBe('Renamed');
  });

  test('400s for an empty body', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);

    const res = await request(app).patch(`/categories/${cat.id}`).send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('400s for a non-numeric id', async () => {
    const res = await request(app).patch('/categories/abc').send({ name: 'x' });
    expect(res.status).toBe(400);
  });

  test('404s for one that does not exist', async () => {
    const res = await request(app).patch('/categories/999999').send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  test('400s for an empty name', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);

    const res = await request(app).patch(`/categories/${cat.id}`).send({ name: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('400s for a name over the length limit', async () => {
    const user = await makeUser();
    const cat = await makeCategory(user.id);

    const res = await request(app)
      .patch(`/categories/${cat.id}`)
      .send({ name: 'x'.repeat(101) });

    expect(res.status).toBe(400);
  });

  test('does not affect other categories', async () => {
    const user = await makeUser();
    const a = await makeCategory(user.id, { name: 'Fabric' });
    const b = await makeCategory(user.id, { name: 'Thread' });

    await request(app).patch(`/categories/${a.id}`).send({ name: 'Fabrics' });

    const untouched = await prisma.category.findUnique({ where: { id: b.id } });
    expect(untouched.name).toBe('Thread');
  });
});