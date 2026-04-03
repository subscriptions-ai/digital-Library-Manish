import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Razorpay from "razorpay";
import nodemailer from "nodemailer";
import crypto from "crypto";
import helmet from "helmet";
import compression from "compression";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Production Middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP if it interferes with Vite/External resources, or configure properly
  }));
  app.use(compression());
  app.use(express.json());

  // Razorpay – lazily initialized per-route so missing keys don't crash startup
  const getRazorpay = () => {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error("Razorpay keys are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables.");
    }
    return new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  };

  // Nodemailer Initialization
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER || "",
      pass: process.env.EMAIL_PASS || "",
    },
  });

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("WARNING: Email credentials are missing in environment variables.");
  }

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Create Razorpay Order
  app.post("/api/payment/order", async (req, res) => {
    try {
      const razorpay = getRazorpay();
      const { amount, currency = "INR", receipt } = req.body;
      const options = {
        amount: Math.round(amount * 100), // amount in the smallest currency unit
        currency,
        receipt,
      };
      const order = await razorpay.orders.create(options);
      res.json(order);
    } catch (error) {
      console.error("Razorpay Order Error:", error);
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  // Verify Razorpay Payment
  app.post("/api/payment/verify", async (req, res) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      const sign = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
        .update(sign.toString())
        .digest("hex");

      if (razorpay_signature === expectedSign) {
        // Payment verified
        // Here you would save the order to Firestore and send an invoice email
        res.json({ status: "success", message: "Payment verified successfully" });
      } else {
        res.status(400).json({ status: "failure", message: "Invalid signature" });
      }
    } catch (error) {
      console.error("Payment Verification Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Institutional Trial Request
  app.post("/api/institutional-trial", async (req, res) => {
    try {
      const formData = req.body;
      const { 
        fullName, 
        institutionalEmail, 
        institutionName, 
        designation, 
        whatsappNumber,
        pincode,
        city,
        state,
        country,
        fullAddress,
        department
      } = formData;

      // 1. Send Admin Notification Email
      const adminMailOptions = {
        from: process.env.EMAIL_USER || "",
        to: process.env.ADMIN_EMAIL || "subscriptions@stmjournals.com",
        subject: `New Institutional Trial Request: ${institutionName}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">New Institutional Trial Request</h2>
            <p>A new request for an institutional trial has been submitted through the website.</p>
            
            <h3 style="color: #1e40af; margin-top: 25px;">Personal Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; width: 200px; background: #f8fafc;">Full Name</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${fullName}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; background: #f8fafc;">Institutional Email</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${institutionalEmail}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; background: #f8fafc;">Designation</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${designation || "N/A"}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; background: #f8fafc;">WhatsApp Number</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${whatsappNumber || "N/A"}</td>
              </tr>
            </table>

            <h3 style="color: #1e40af; margin-top: 25px;">Institution & Department</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; width: 200px; background: #f8fafc;">Institution Name</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${institutionName}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; background: #f8fafc;">Department</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${department}</td>
              </tr>
            </table>

            <h3 style="color: #1e40af; margin-top: 25px;">Address Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; width: 200px; background: #f8fafc;">Pincode</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${pincode}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; background: #f8fafc;">City</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${city}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; background: #f8fafc;">State</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${state}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; background: #f8fafc;">Country</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${country}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; background: #f8fafc;">Full Address</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">${fullAddress || "N/A"}</td>
              </tr>
            </table>
          </div>
        `
      };

      // 2. Send User Confirmation Email
      const userMailOptions = {
        from: process.env.EMAIL_USER || "",
        to: institutionalEmail,
        subject: "Your Institutional Trial Request has been received",
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6;">
            <h2 style="color: #2563eb;">Hello ${fullName},</h2>
            <p>Thank you for requesting an institutional trial for <strong>${institutionName}</strong>.</p>
            <p>We have received your request for the <strong>${department}</strong> department. Our team is reviewing your details and will get in touch with you shortly to set up the trial access.</p>
            
            <div style="background: #f1f5f9; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #1e40af;">What happens next?</h3>
              <ol>
                <li>Our institutional access team will verify your details.</li>
                <li>We will contact you to discuss IP-based authentication or remote access options.</li>
                <li>Once configured, your entire institution will have seamless access for the trial period.</li>
              </ol>
            </div>

            <p>If you have any questions in the meantime, please reply to this email or contact us at subscriptions@stmjournals.com.</p>
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
            <p style="font-size: 12px; color: #64748b;">
              <strong>STM Digital Library</strong><br />
              A-118, 2nd Floor, Sector-63, Noida - 201301, U.P., India<br />
              Email: subscriptions@stmjournals.com | Web: www.stmjournals.com
            </p>
          </div>
        `
      };

      await Promise.all([
        transporter.sendMail(adminMailOptions),
        transporter.sendMail(userMailOptions)
      ]);

      res.json({ status: "success", message: "Trial request submitted successfully" });
    } catch (error) {
      console.error("Institutional Trial Error:", error);
      res.status(500).json({ error: "Failed to submit trial request" });
    }
  });

  // Contact Form Submission
  app.post("/api/contact", async (req, res) => {
    try {
      const formData = req.body;
      const { 
        fullName, 
        email, 
        mobile, 
        whatsapp, 
        designation, 
        departments, 
        state, 
        organization, 
        message 
      } = formData;

      // 1. Send Admin Notification Email
      const adminMailOptions = {
        from: process.env.EMAIL_USER || "",
        to: process.env.ADMIN_EMAIL || "subscriptions@stmjournals.com",
        subject: "New Contact Inquiry from Website",
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #2563eb;">New Contact Inquiry</h2>
            <p>You have received a new inquiry from the website contact form.</p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
              <tr style="background: #f8fafc;">
                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; width: 200px;">Full Name</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0;">${fullName}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Email Address</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0;">${email}</td>
              </tr>
              <tr style="background: #f8fafc;">
                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Mobile Number</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0;">${mobile}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">WhatsApp Number</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0;">${whatsapp}</td>
              </tr>
              <tr style="background: #f8fafc;">
                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Designation</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0;">${designation}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Departments</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0;">${departments.join(", ")}</td>
              </tr>
              <tr style="background: #f8fafc;">
                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">State</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0;">${state}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Organization</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0;">${organization}</td>
              </tr>
              <tr style="background: #f8fafc;">
                <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Message</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0;">${message}</td>
              </tr>
            </table>
          </div>
        `
      };

      // 2. Send User Confirmation Email
      const userMailOptions = {
        from: process.env.EMAIL_USER || "",
        to: email,
        subject: "Thank you for contacting STM Digital Library",
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6;">
            <h2 style="color: #2563eb;">Hello ${fullName},</h2>
            <p>Thank you for reaching out to us. We have received your inquiry and our team will get back to you shortly.</p>
            <div style="background: #f1f5f9; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Summary of your details:</h3>
              <ul style="list-style: none; padding: 0;">
                <li><strong>Organization:</strong> ${organization}</li>
                <li><strong>Departments:</strong> ${departments.join(", ")}</li>
                <li><strong>Message:</strong> ${message}</li>
              </ul>
            </div>
            <p>If you have any urgent queries, feel free to call us at +91-120-4781200.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="font-size: 12px; color: #64748b;">
              <strong>STM Digital Library</strong><br />
              A-118, 2nd Floor, Sector-63, Noida - 201301, U.P., India<br />
              Email: info@stmjournals.com | Web: www.stmjournals.com
            </p>
          </div>
        `
      };

      await Promise.all([
        transporter.sendMail(adminMailOptions),
        transporter.sendMail(userMailOptions)
      ]);

      res.json({ status: "success", message: "Inquiry submitted successfully" });
    } catch (error) {
      console.error("Contact Form Error:", error);
      res.status(500).json({ error: "Failed to submit inquiry" });
    }
  });

  // Send Quotation Email
  app.post("/api/quotation/send", async (req, res) => {
    try {
      const { userEmail, userName, quotationData, pdfBase64 } = req.body;
      
      const mailOptions = {
        from: process.env.EMAIL_USER || "",
        to: [userEmail, process.env.ADMIN_EMAIL || "admin@stmjournals.com"],
        subject: `Quotation for STM Digital Library - ${quotationData.quotationNumber}`,
        text: `Dear ${userName},\n\nPlease find attached the quotation for your requested departments.\n\nQuotation Number: ${quotationData.quotationNumber}\nTotal Amount: ₹${quotationData.totalAmount}\n\nRegards,\nSTM Digital Library Team`,
        attachments: [
          {
            filename: `Quotation_${quotationData.quotationNumber}.pdf`,
            content: pdfBase64,
            encoding: 'base64'
          }
        ]
      };

      await transporter.sendMail(mailOptions);
      res.json({ status: "success", message: "Quotation sent successfully" });
    } catch (error) {
      console.error("Quotation Email Error:", error);
      res.status(500).json({ error: "Failed to send quotation email" });
    }
  });

  // Send Invoice Email
  app.post("/api/invoice/send", async (req, res) => {
    try {
      const { userEmail, userName, invoiceData, pdfBase64 } = req.body;
      
      const mailOptions = {
        from: process.env.EMAIL_USER || "",
        to: [userEmail, process.env.ADMIN_EMAIL || "admin@stmjournals.com"],
        subject: `Invoice for STM Digital Library - ${invoiceData.invoiceNumber}`,
        text: `Dear ${userName},\n\nThank you for your subscription. Please find attached the tax invoice for your purchase.\n\nInvoice Number: ${invoiceData.invoiceNumber}\nTotal Amount: ₹${invoiceData.grandTotal}\n\nRegards,\nSTM Digital Library Team`,
        attachments: [
          {
            filename: `Invoice_${invoiceData.invoiceNumber}.pdf`,
            content: pdfBase64,
            encoding: 'base64'
          }
        ]
      };

      await transporter.sendMail(mailOptions);
      res.json({ status: "success", message: "Invoice sent successfully" });
    } catch (error) {
      console.error("Invoice Email Error:", error);
      res.status(500).json({ error: "Failed to send invoice email" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} (Mode: ${process.env.NODE_ENV || 'development'})`);
  });
}

startServer();
