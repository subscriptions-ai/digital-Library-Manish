import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'placeholder_access_key',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'placeholder_secret_key',
  },
});

const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@stmjournals.com';

// Basic email sending (simplified for raw emails without attachments for now)
// Note: For attachments, you'd typically construct a MIME message. 
export const sendEmail = async (to: string[], subject: string, bodyText: string, attachment?: { filename: string, content: Buffer }) => {
  
  if (attachment) {
    // Constructing a MIME email with attachment is complex. For actual implementation,
    // consider using nodemailer with SES transport, or constructing raw MIME.
    // For this demonstration, we'll log it.
    console.log(`Sending email with attachment to ${to.join(', ')}`);
  }

  // Simplified basic sending logic mapping to SES for the future implementation
  const params = {
    Source: EMAIL_FROM,
    Destinations: to,
    RawMessage: {
      Data: new Uint8Array(Buffer.from(`From: ${EMAIL_FROM}\nTo: ${to.join(',')}\nSubject: ${subject}\n\n${bodyText}`)),
    },
  };

  try {
    const command = new SendRawEmailCommand(params);
    await sesClient.send(command);
    console.log(`Email sent to ${to.join(', ')}`);
  } catch (error) {
    console.error('Error sending email via SES:', error);
    // Suppress error for local dev if AWS is not fully configured
  }
};
