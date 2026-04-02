import { db } from './src/backend/db.js';
import { users } from './src/backend/schema.js';
import bcrypt from 'bcryptjs';

async function seed() {
  try {
    const passwordHash = await bcrypt.hash('admin123', 10);
    await db.insert(users).values({
      email: 'admin@stmjournals.com',
      passwordHash,
      displayName: 'Super Admin',
      role: 'SuperAdmin',
    });
    console.log('Successfully seeded admin user!');
  } catch (error) {
    console.error('Error seeding admin user:', error);
  } finally {
    process.exit(0);
  }
}

seed();
