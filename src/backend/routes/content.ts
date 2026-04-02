import { Router } from 'express';
import { db } from '../db';
import { content } from '../schema';
import { eq } from 'drizzle-orm';
import { authenticate, requireRole } from '../middleware/auth';

export const contentRouter = Router();

contentRouter.get('/', async (req, res) => {
  try {
    const allContent = await db.query.content.findMany();
    res.json(allContent);
  } catch (error) {
    console.error('Fetch content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

contentRouter.post('/', authenticate, requireRole(['SuperAdmin', 'ContentManager', 'Agency']), async (req, res) => {
  try {
    const { title, authors, contentType, subjectArea, publishingMode, fileS3Key } = req.body;
    const [newContent] = await db.insert(content).values({
      title,
      authors,
      contentType,
      subjectArea,
      fileS3Key,
      publishingMode,
    }).returning();
    res.status(201).json(newContent);
  } catch (error) {
    console.error('Create content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

contentRouter.delete('/:id', authenticate, requireRole(['SuperAdmin', 'ContentManager']), async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(content).where(eq(content.id, id));
    res.json({ message: 'Content deleted successfully' });
  } catch (error) {
    console.error('Delete content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
