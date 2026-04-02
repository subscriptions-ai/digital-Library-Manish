import { Router } from 'express';
import { db } from '../db';
import { users } from '../schema';
import { eq } from 'drizzle-orm';
import { authenticate, requireRole } from '../middleware/auth';

export const usersRouter = Router();

usersRouter.use(authenticate);

// Get all users - Admin only
usersRouter.get('/', requireRole(['SuperAdmin']), async (req, res) => {
  try {
    const allUsers = await db.select({
      id: users.id,
      email: users.email,
      role: users.role,
      displayName: users.displayName,
      status: users.status,
      createdAt: users.createdAt
    }).from(users);
    res.json(allUsers);
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user details
usersRouter.patch('/:id', requireRole(['SuperAdmin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { role, status, displayName } = req.body;
    
    const [updatedUser] = await db.update(users).set({
      role,
      status,
      displayName,
      updatedAt: new Date(),
    }).where(eq(users.id, id)).returning({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status
    });

    if (!updatedUser) return res.status(404).json({ error: 'User not found' });
    res.json(updatedUser);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user
usersRouter.delete('/:id', requireRole(['SuperAdmin']), async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(users).where(eq(users.id, id));
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
