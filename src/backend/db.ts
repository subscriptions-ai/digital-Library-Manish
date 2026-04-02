import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
// @ts-ignore
import * as schema from './schema';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/stm_library',
});

export const db = drizzle(pool, { schema });
