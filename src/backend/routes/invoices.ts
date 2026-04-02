import { Router } from 'express';
import { db } from '../db';
import { invoices } from '../schema';
import { eq } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { uploadToS3, getSignedUrl } from '../services/s3';
import { sendEmail } from '../services/email';

export const invoicesRouter = Router();

invoicesRouter.use(authenticate);

invoicesRouter.post('/', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { userEmail, userName, invoiceData, orderId, pdfBase64 } = req.body;

    const buffer = Buffer.from(pdfBase64, 'base64');
    const s3Key = `invoices/${invoiceData.invoiceNumber}.pdf`;
    
    // Upload PDF to S3
    await uploadToS3(buffer, s3Key, 'application/pdf');

    // Create DB Record
    const [newInvoice] = await db.insert(invoices).values({
      userId,
      orderId, // Should match an existing order
      invoiceNumber: invoiceData.invoiceNumber,
      grandTotal: invoiceData.grandTotal,
      pdfS3Key: s3Key,
    }).returning();

    // Send Email
    await sendEmail(
      [userEmail, process.env.ADMIN_EMAIL || 'admin@stmjournals.com'],
      `Invoice for STM Digital Library - ${invoiceData.invoiceNumber}`,
      `Dear ${userName},\n\nThank you for your subscription. Please find attached the tax invoice for your purchase.\n\nInvoice Number: ${invoiceData.invoiceNumber}\nTotal Amount: ₹${invoiceData.grandTotal}\n\nRegards,\nSTM Digital Library Team`,
      { filename: `Invoice_${invoiceData.invoiceNumber}.pdf`, content: buffer }
    );

    res.status(201).json(newInvoice);
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

invoicesRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    let url = null;
    if (invoice.pdfS3Key) {
      url = await getSignedUrl(invoice.pdfS3Key);
    }

    res.json({ ...invoice, signedUrl: url });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
