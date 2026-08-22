import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

const testEnv = dotenv.config({ path: '.env.test' }).parsed;

export default defineConfig({
  test: {
    environment: 'node',
    env: testEnv,
    fileParallelism: false,
  },
});