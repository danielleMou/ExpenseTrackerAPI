import prisma from '../prisma.js';

export default async function resetDatabase() {
  if (!process.env.DATABASE_URL?.includes('expense_tracker_test')) {
    throw new Error('Refusing to reset: DATABASE_URL is not the test database.');
  }

  const tables = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;

  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}