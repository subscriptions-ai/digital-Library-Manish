import { Router } from 'express';
import { db } from '../db';
import { quotations } from '../schema';
import { eq } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { uploadToS3, getSignedUrl } from '../services/s3';
import { sendEmail } from '../services/email';

export const quotationsRouter = Router();

quotationsRouter.use(authenticate);

quotationsRouter.post('/', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { userEmail, userName, quotationData, pdfBase64 } = req.body;

    const buffer = Buffer.from(pdfBase64, 'base64');
    const s3Key = `quotations/${quotationData.quotationNumber}.pdf`;
    
    // Upload PDF to S3
    await uploadToS3(buffer, s3Key, 'application/pdf');

    // Create DB Record
    const [newQuotation] = await db.insert(quotations).values({
      userId,
      quotationNumber: quotationData.quotationNumber,
      itemsJson: quotationData.items,
      totalAmount: quotationData.totalAmount,
      pdfS3Key: s3Key,
    }).returning();

    // Send Email
    await sendEmail(
      [userEmail, process.env.ADMIN_EMAIL || 'admin@stmjournals.com'],
      `Quotation for STM Digital Library - ${quotationData.quotationNumber}`,
      `Dear ${userName},\n\nPlease find attached the quotation for your requested departments.\n\nQuotation Number: ${quotationData.quotationNumber}\nTotal Amount: ₹${quotationData.totalAmount}\n\nRegards,\nSTM Digital Library Team`,
      { filename: `Quotation_${quotationData.quotationNumber}.pdf`, content: buffer }
    );

    res.status(201).json(newQuotation);
  } catch (error) {
    console.error('Create quotation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

quotationsRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const quotation = await db.query.quotations.findFirst({ where: eq(quotations.id, id) });
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });

    let url = null;
    if (quotation.pdfS3Key) {
      url = await getSignedUrl(quotation.pdfS3Key);
    }

    res.json({ ...quotation, signedUrl: url });
  } catch (error) {
    console.error('Get quotation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
