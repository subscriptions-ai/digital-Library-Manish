import express from "express";
import crypto from "crypto";

if (!(crypto as any).hash) {
  (crypto as any).hash = function(algo: string, data: any, encoding: any) {
    return crypto.createHash(algo).update(data).digest(encoding);
  };
}
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Razorpay from "razorpay";
import nodemailer from "nodemailer";
import * as sesv2 from "@aws-sdk/client-sesv2";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { setupExtractionRoutes } from "./src/routes/extraction.js";
import { COMPANY_DETAILS, currentIssuer } from "./src/config.js";
import { DOMAINS } from "./src/constants.js";
import { runIngestionPass, getState as getIngestionState, normaliseIssn } from "./src/lib/ingestionWorker.js";
import {
  MAIL_BASE, esc, escLines, buildEmail,
  eBody, eH1, eP, eMuted, eBtn, eCard, eRows, eQuote,
} from "./src/lib/emailTemplates.js";

const prisma = new PrismaClient();

// Resolve the app directory in a way that works both when this file is loaded
// as an ES module (tsx: package.json "type":"module", no __dirname) and when it
// is bundled to CommonJS by esbuild (where __dirname is provided natively).
const APP_DIR = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

const SETTINGS_FILE = path.join(APP_DIR, 'settings.json');
function getSystemSettings() {
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch { return { emailVerificationEnabled: true }; }
  }
  return { emailVerificationEnabled: true };
}
function setSystemSettings(settings: any) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

dotenv.config();

const currentDir = process.cwd();

async function startServer() {
  const app = express();
  // Behind Coolify/Traefik (and Cloudflare) the app receives X-Forwarded-For.
  // Trust the reverse proxy so req.ip is the real client and express-rate-limit
  // stops throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
  app.set('trust proxy', 1);
  const PORT = Number(process.env.PORT) || 3000;

  // Production Middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP if it interferes with Vite/External resources, or configure properly
  }));
  app.use(compression());
  
  // Rate Limiting Protection
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests from this IP, please try again after 15 minutes" }
  });
  
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, // Max 15 login attempts per 15 minutes
    message: { error: "Too many login attempts from this IP, please try again after 15 minutes" }
  });

  app.use("/api/", apiLimiter);
  app.use("/api/auth/login", loginLimiter);
  app.use("/api/auth/admin-login", loginLimiter);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  const JWT_SECRET = process.env.JWT_SECRET || "your-fallback-secret-for-dev-only";
  if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
    throw new Error("CRITICAL SECURITY ERROR: JWT_SECRET must be set in production environment variables.");
  }

  // Middleware to authenticate JWT
  const authenticateJWT = (req: any, res: any, next: any) => {
    let token = '';
    const authHeader = req.headers.authorization;
    if (authHeader) {
      token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (token) {
      jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) {
          return res.status(403).json({ error: "Forbidden: Invalid or expired token" });
        }
        req.user = user;
        next();
      });
    } else {
      res.status(401).json({ error: "Unauthorized: No token provided" });
    }
  };

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

  // Amazon SESv2 Initialization
  const ses = new sesv2.SESv2Client({
    region: (process.env.AWS_REGION || "ap-south-1").trim(),
    credentials: {
      accessKeyId: (process.env.AWS_ACCESS_KEY_ID || "").trim(),
      secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || "").trim(),
    },
  });

  // Choose transporter: SES for production, Ethereal for local dev/testing
  const isDevMode = !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || process.env.NODE_ENV === 'development';

  let transporter: any;
  let etherealUser = '';
  let etherealPass = '';

  if (isDevMode) {
    // Create a free Ethereal test account on startup — no signup needed
    const testAccount = await nodemailer.createTestAccount();
    etherealUser = testAccount.user;
    etherealPass = testAccount.pass;
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: etherealUser, pass: etherealPass },
    });
    console.log('\n🧪 ===== LOCAL DEV MODE: Using Ethereal Email =====');
    console.log(`   📧 Ethereal Inbox: https://ethereal.email/messages`);
    console.log(`   👤 User: ${etherealUser}`);
    console.log(`   🔑 Pass: ${etherealPass}`);
    console.log('   ℹ️  Every email sent will print a preview URL in this console.');
    console.log('=================================================\n');
  } else {
    transporter = nodemailer.createTransport({
      SES: { sesClient: ses, SendEmailCommand: sesv2.SendEmailCommand },
    });
    // Verify transporter on startup
    transporter.verify((error: any) => {
      if (error) {
        console.error("❌ Email Transporter Verification Failed:", error);
      } else {
        console.log("✅ Email Transporter is ready (SES v2)");
      }
    });
  }

  // Logo CID attachment - auto-injected by sendMail for all buildEmail() templates
  const _logoPath = path.join(process.cwd(), 'public', 'assets', 'stm-logo-email.png');
  const _logoCidAttachment = fs.existsSync(_logoPath) ? {
    filename: 'stm-logo-email.png',
    path: _logoPath,
    cid: 'stm-logo-email'
  } : null;

  const createDynamicTransporter = () => {
    const settings = getSystemSettings();
    const accessKey = settings.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID;
    const secretKey = settings.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
    const region = settings.awsRegion || process.env.AWS_REGION || "us-west-2";

    if (!accessKey || !secretKey) {
      // Fallback to dev mode if no keys
      return { transporter: null, isDev: true };
    }

    const dynamicSes = new sesv2.SESv2Client({
      region: region.trim(),
      credentials: { accessKeyId: accessKey.trim(), secretAccessKey: secretKey.trim() }
    });

    const dynamicTransporter = nodemailer.createTransport({
      SES: { sesClient: dynamicSes, SendEmailCommand: sesv2.SendEmailCommand },
    });
    
    return { transporter: dynamicTransporter, isDev: false, emailFrom: settings.emailFrom || process.env.EMAIL_FROM || COMPANY_DETAILS.email };
  };

  const sendMail = async (mailOptions: any, logAsSent = true) => {
    try {
      const { transporter: dynTrans, isDev, emailFrom } = createDynamicTransporter();
      const opts = { ...mailOptions };
      
      // Always enforce the configured dynamic emailFrom, even if hardcoded in the opts
      if (opts.from && typeof opts.from === 'string') {
        // If it's formatted like '"Name" <email>', preserve the name but replace the email
        if (opts.from.includes('<') && opts.from.includes('>')) {
          const namePart = opts.from.split('<')[0];
          opts.from = `${namePart}<${emailFrom}>`;
        } else {
          opts.from = emailFrom;
        }
      } else {
        opts.from = `"STM Digital Library" <${emailFrom}>`;
      }

      if (_logoCidAttachment && opts.html && typeof opts.html === 'string' && opts.html.includes('cid:stm-logo-email')) {
        opts.attachments = [...(opts.attachments || []), _logoCidAttachment];
      }
      
      let info;
      if (isDev) {
        // Use global ethereal transporter
        info = await transporter.sendMail(opts);
        const previewUrl = nodemailer.getTestMessageUrl(info);
        console.log('\n📨 ===== EMAIL SENT (DEV PREVIEW) =====');
        console.log(`   To: ${opts.to}`);
        console.log(`   Subject: ${opts.subject}`);
        console.log(`   🔗 Preview URL: ${previewUrl}`);
        console.log('=======================================\n');
      } else {
        info = await dynTrans.sendMail(opts);
      }

      if (logAsSent) {
        await prisma.emailLog.create({
          data: {
            to: typeof opts.to === 'string' ? opts.to : JSON.stringify(opts.to),
            subject: opts.subject,
            status: "Sent",
            htmlContent: opts.html || null
          }
        }).catch(e => console.error("Failed to log email success", e));
      }
      
      return info;
    } catch (error: any) {
      console.error("❌ Email Sending Failed:", error);
      
      if (logAsSent) {
        await prisma.emailLog.create({
          data: {
            to: typeof mailOptions.to === 'string' ? mailOptions.to : JSON.stringify(mailOptions.to),
            subject: mailOptions.subject || "No Subject",
            status: "Failed",
            error: error?.message || String(error),
            htmlContent: mailOptions.html || null
          }
        }).catch(e => console.error("Failed to log email error", e));
      }
      
      // Throw error if this is a test email, else swallow to avoid crashing forms
      if (mailOptions._isTestEmail) {
        throw error;
      }
      return null;
    }
  };

  // Email layout + content kit live in src/lib/emailTemplates.ts (imported at the
  // top of this file) so the templates can be rendered without booting the server.
  const ADMIN_INBOX = process.env.ADMIN_EMAIL || COMPANY_DETAILS.email;

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Public Stats for Home Page
  app.get("/api/public/counts", async (req, res) => {
    try {
      const [books, periodicals, theses, videos, totalContent] = await Promise.all([
        prisma.content.count({ where: { contentType: "Books", status: { not: "Draft" } } }),
        prisma.content.count({ where: { contentType: "Periodicals", status: { not: "Draft" } } }),
        prisma.content.count({ where: { contentType: "Theses", status: { not: "Draft" } } }),
        prisma.content.count({ where: { contentType: "Educational Videos", status: { not: "Draft" } } }),
        prisma.content.count({ where: { status: { not: "Draft" } } })
      ]);

      res.json({
        categories: [
          { label: "Books", value: `${books}+` },
          { label: "Periodicals", value: `${periodicals}+` },
          { label: "Theses", value: `${theses}+` },
          { label: "Educational Videos", value: `${videos}+` }
        ],
        totalContent
      });
    } catch (error) {
      console.error("Public counts error:", error);
      res.status(500).json({ error: "Failed to fetch counts" });
    }
  });

  // Public Domain Counts for Navbar
  // Public Stats by specific Content Type
  app.get("/api/public/content-type-counts", async (req, res) => {
    try {
      const groups = await prisma.content.groupBy({
        by: ['contentType'],
        where: { status: { not: 'Draft' } },
        _count: { id: true }
      });
      const countsMap = groups.reduce((acc: any, g: any) => {
        if (g.contentType) acc[g.contentType] = g._count.id;
        return acc;
      }, {});
      res.json(countsMap);
    } catch (error) {
      console.error("Content type counts error:", error);
      res.status(500).json({ error: "Failed to fetch content type counts" });
    }
  });

  app.get("/api/public/domain-counts", async (req, res) => {
    try {
      const groups = await prisma.content.groupBy({
        by: ['domain'],
        where: { status: { not: 'Draft' }, domain: { not: null } },
        _count: { id: true }
      });
      const countsMap = groups.reduce((acc: any, g: any) => {
        if (g.domain) acc[g.domain] = g._count.id;
        return acc;
      }, {});
      res.json(countsMap);
    } catch (error) {
      console.error("Domain counts error:", error);
      res.status(500).json({ error: "Failed to fetch domain counts" });
    }
  });

  // --- Public Settings API ---
  app.get("/api/public/settings", (req, res) => {
    const settings = getSystemSettings();
    res.json({
      emailVerificationEnabled: settings.emailVerificationEnabled,
      publisherSafeMode: Boolean(settings.publisherSafeMode),
      hidePricing: Boolean(settings.hidePricing),   // hide all commercial UI on the public site
    });
  });


  // --- Email Verification OTP System ---
  app.post("/api/verify/check-or-send", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });

      const settings = getSystemSettings();
      if (!settings.emailVerificationEnabled) {
        return res.json({ verified: true });
      }

      let record = await (prisma as any).emailVerification.findUnique({ where: { email } });
      
      if (record && record.isVerified) {
        return res.json({ verified: true });
      }

      // Generate 6 digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

      if (record) {
        await (prisma as any).emailVerification.update({
          where: { email },
          data: { otp, otpExpiry }
        });
      } else {
        await (prisma as any).emailVerification.create({
          data: { email, otp, otpExpiry, isVerified: false }
        });
      }

      const mailOptions = {
        from: `"${COMPANY_DETAILS.name}" <${COMPANY_DETAILS.email}>`,
        to: email,
        subject: "Your Email Verification OTP",
        html: buildEmail(`
          <h2 style="color: #1e3a6e;">Email Verification</h2>
          <p>Please use the following OTP to verify your email address. It is valid for 10 minutes.</p>
          <h1 style="letter-spacing: 4px; color: #2563eb; background: #f1f5f9; padding: 10px 20px; text-align: center; border-radius: 8px; width: max-content; margin: 20px auto;">${otp}</h1>
        `)
      };
      await sendMail(mailOptions);

      console.log(`\n=========================================`);
      console.log(`🔑 OTP FOR VERIFICATION (TESTING):`);
      console.log(`📧 Email: ${email}`);
      console.log(`🔢 OTP: ${otp}`);
      console.log(`=========================================\n`);

      res.json({ otpSent: true });
    } catch (err) {
      console.error("OTP send error:", err);
      res.status(500).json({ error: "Failed to send OTP" });
    }
  });

  app.post("/api/verify/confirm", async (req, res) => {
    try {
      const { email, otp } = req.body;
      if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });

      const record = await (prisma as any).emailVerification.findUnique({ where: { email } });
      if (!record || record.isVerified) {
        return res.status(400).json({ error: "Invalid request or already verified" });
      }

      if (record.otp !== otp || !record.otpExpiry || record.otpExpiry < new Date()) {
        return res.status(400).json({ error: "Invalid or expired OTP" });
      }

      await (prisma as any).emailVerification.update({
        where: { email },
        data: { isVerified: true, otp: null, otpExpiry: null }
      });

      res.json({ success: true });
    } catch (err) {
      console.error("OTP verify error:", err);
      res.status(500).json({ error: "Failed to verify OTP" });
    }
  });

  // Auth: Signup
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { email, password, name, organization, contact, designation } = req.body;
      
      // Check if user already exists in PostgreSQL
      const existingUser = await prisma.user.findUnique({ where: { email } });
      
      if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      
      const userObj = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          displayName: name,
          organization: organization || "",
          contact: contact || "",
          designation: designation || "",
          role: email === "info@celnet.in" ? "SuperAdmin" : "Subscriber",
          status: "Active",
        }
      });

      const token = jwt.sign({ uid: userObj.id, email, role: userObj.role }, JWT_SECRET, { expiresIn: '24h' });
      
      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      const adminMailOptions = {
        from: `"STM Digital Library" <${emailFrom}>`,
        to: process.env.ADMIN_EMAIL || COMPANY_DETAILS.email,
        subject: `🆕 New User Registration — ${name}`,
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;">` +
          `<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">🆕 New Subscriber Alert</p>` +
          `<p style="margin:0 0 20px;font-size:13px;color:#475569;">A new user has just registered on the platform.</p>` +
          `<table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:20px;">` +
          `<tr style="background:#f8fafc;"><td style="padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;" colspan="2">User Details</td></tr>` +
          `<tr><td style="padding:10px 16px;font-size:12px;color:#94a3b8;width:38%;border-bottom:1px solid #f1f5f9;">Full Name</td><td style="padding:10px 16px;font-size:13px;font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9;">${name}</td></tr>` +
          `<tr style="background:#fafbfc;"><td style="padding:10px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Email</td><td style="padding:10px 16px;font-size:13px;font-weight:700;color:#1e3a6e;border-bottom:1px solid #f1f5f9;">${email}</td></tr>` +
          `<tr><td style="padding:10px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Contact</td><td style="padding:10px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${contact || 'Not provided'}</td></tr>` +
          `<tr style="background:#fafbfc;"><td style="padding:10px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Designation</td><td style="padding:10px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${designation || 'Not provided'}</td></tr>` +
          `<tr><td style="padding:10px 16px;font-size:12px;color:#94a3b8;">Organization</td><td style="padding:10px 16px;font-size:13px;color:#1e293b;">${organization || 'Not provided'}</td></tr>` +
          `</table>` +
          `<div style="background:#eff6ff;border-left:4px solid #1e3a6e;border-radius:0 8px 8px 0;padding:12px 16px;">` +
          `<p style="margin:0;font-size:13px;color:#1e3a6e;">⚡ <strong>Action:</strong> Review the new subscriber and assign a plan if needed.</p></div>` +
          `</td></tr>`)
      };

      const userMailOptions = {
        from: `"STM Digital Library" <${emailFrom}>`,
        to: email,
        subject: `🎉 Welcome to STM Digital Library, ${name}!`,
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;">` +
          `<h3 style="margin:0 0 10px;font-size:17px;color:#1e3a6e;">Welcome aboard, ${name}! 🎓</h3>` +
          `<p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.7;">Your account is ready. You now have access to STM Digital Library — your gateway to peer-reviewed journals, e-books, conference proceedings &amp; more.</p>` +
          `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;"><tr>` +
          `<td style="text-align:center;padding:14px 8px;background:#f0f9ff;border-radius:10px;"><div style="font-size:24px;margin-bottom:6px;">📚</div><p style="margin:0;font-size:11px;font-weight:700;color:#0369a1;">50,000+<br/>Journals</p></td>` +
          `<td width="4"></td>` +
          `<td style="text-align:center;padding:14px 8px;background:#f0fdf4;border-radius:10px;"><div style="font-size:24px;margin-bottom:6px;">🎥</div><p style="margin:0;font-size:11px;font-weight:700;color:#15803d;">Educational<br/>Videos</p></td>` +
          `<td width="4"></td>` +
          `<td style="text-align:center;padding:14px 8px;background:#fdf4ff;border-radius:10px;"><div style="font-size:24px;margin-bottom:6px;">📖</div><p style="margin:0;font-size:11px;font-weight:700;color:#7e22ce;">E-Books &amp;<br/>Theses</p></td>` +
          `</tr></table>` +
          `<div style="background:#1e3a6e;border-radius:10px;padding:18px 22px;margin-bottom:18px;">` +
          `<p style="color:#93c5fd;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">🚀 Getting Started</p>` +
          `<p style="margin:4px 0;font-size:13px;color:#e2e8f0;"><span style="color:#86efac;font-weight:700;">01.</span> Log in at <strong>journalslibrary.com</strong></p>` +
          `<p style="margin:4px 0;font-size:13px;color:#e2e8f0;"><span style="color:#86efac;font-weight:700;">02.</span> Browse domains &amp; subscribe to your field</p>` +
          `<p style="margin:4px 0;font-size:13px;color:#e2e8f0;"><span style="color:#86efac;font-weight:700;">03.</span> Access full-text content instantly</p>` +
          `</div>` +
          `<p style="font-size:12px;color:#64748b;margin:0;">Questions? Email <a href="mailto:${COMPANY_DETAILS.email}" style="color:#1e3a6e;font-weight:600;">${COMPANY_DETAILS.email}</a> or call <strong>+91-120-4781200</strong></p>` +
          `</td></tr>`)
      };

      await sendMail(adminMailOptions);
      await sendMail(userMailOptions);

      // Don't send password back
      const { password: _, ...profile } = userObj;
      res.json({ token, user: profile });
    } catch (error) {
      console.error("Signup Error:", error);
      res.status(500).json({ error: "Failed to create account" });
    }
  });

  // Auth: Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      // -- Master Admin Env Fallback (Recovery Mode) --
      if (
        process.env.MASTER_ADMIN_EMAIL && 
        process.env.MASTER_ADMIN_PASSWORD &&
        email === process.env.MASTER_ADMIN_EMAIL && 
        password === process.env.MASTER_ADMIN_PASSWORD
      ) {
        let adminUser = await prisma.user.findUnique({ where: { email } });
        if (!adminUser) {
          adminUser = await prisma.user.create({
            data: {
              email,
              password: await bcrypt.hash(password, 10),
              role: 'SuperAdmin',
              displayName: 'Super Admin',
            }
          });
        }
        
        const token = jwt.sign(
          { uid: adminUser.id, email, role: 'SuperAdmin' }, 
          JWT_SECRET, 
          { expiresIn: '24h' }
        );
        
        const { password: _, ...profile } = adminUser;
        return res.json({ token, user: profile });
      }
      // -----------------------------------------------

      const userObj = await prisma.user.findUnique({ where: { email } });
      
      if (!userObj) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (userObj.isBlocked) {
        return res.status(403).json({ error: "Your account has been blocked. Please contact support." });
      }

      if (userObj.isDemoAccount && userObj.demoExpiresAt && new Date() > userObj.demoExpiresAt) {
        return res.status(403).json({ error: "Your demo account has expired. Please upgrade to continue." });
      }

      const isPasswordValid = await bcrypt.compare(password, userObj.password);
      
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign(
        { uid: userObj.id, email, role: userObj.role, institutionId: userObj.institutionId }, 
        JWT_SECRET, 
        { expiresIn: '24h' }
      );
      
      const { password: _, ...profile } = userObj;
      res.json({ token, user: profile });
    } catch (error) {
      console.error("Login Error:", error);
      res.status(500).json({ error: "Failed to login" });
    }
  });

  // Auth: Forgot Password - Send OTP
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });

      const userObj = await prisma.user.findUnique({ where: { email } });
      if (!userObj) {
        // Return success even if user not found to prevent email enumeration attacks
        return res.json({ message: "If your email is registered, an OTP has been sent." });
      }

      // Generate 6 digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

      const record = await (prisma as any).emailVerification.findUnique({ where: { email } });
      if (record) {
        await (prisma as any).emailVerification.update({
          where: { email },
          data: { otp, otpExpiry }
        });
      } else {
        await (prisma as any).emailVerification.create({
          data: { email, otp, otpExpiry, isVerified: false }
        });
      }

      const mailOptions = {
        from: `"${COMPANY_DETAILS.name}" <${COMPANY_DETAILS.email}>`,
        to: email,
        subject: "Password Reset OTP",
        html: buildEmail(`
          <h2 style="color: #1e3a6e;">Password Reset Request</h2>
          <p>We received a request to reset your password for your STM Digital Library account.</p>
          <p>Please use the following OTP to reset your password. It is valid for 10 minutes.</p>
          <h1 style="letter-spacing: 4px; color: #2563eb; background: #f1f5f9; padding: 10px 20px; text-align: center; border-radius: 8px; width: max-content; margin: 20px auto;">${otp}</h1>
          <p>If you did not request a password reset, please ignore this email.</p>
        `)
      };
      await sendMail(mailOptions);

      res.json({ message: "If your email is registered, an OTP has been sent." });
    } catch (error) {
      console.error("Forgot Password Error:", error);
      res.status(500).json({ error: "Failed to process request" });
    }
  });

  // Auth: Reset Password - Verify OTP and update password
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email, otp, newPassword } = req.body;
      if (!email || !otp || !newPassword) {
        return res.status(400).json({ error: "Email, OTP, and new password are required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters long" });
      }

      const record = await (prisma as any).emailVerification.findUnique({ where: { email } });
      if (!record) {
        return res.status(400).json({ error: "Invalid request" });
      }

      if (record.otp !== otp || !record.otpExpiry || record.otpExpiry < new Date()) {
        return res.status(400).json({ error: "Invalid or expired OTP" });
      }

      const userObj = await prisma.user.findUnique({ where: { email } });
      if (!userObj) {
        return res.status(404).json({ error: "User not found" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { email },
        data: { password: hashedPassword }
      });

      // Clear the OTP
      await (prisma as any).emailVerification.update({
        where: { email },
        data: { otp: null, otpExpiry: null }
      });

      res.json({ success: true, message: "Password has been successfully reset" });
    } catch (error) {
      console.error("Reset Password Error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // Auth: Get Current User
  app.get("/api/auth/me", authenticateJWT, async (req: any, res) => {
    try {
      const userObj = await prisma.user.findUnique({ 
        where: { email: req.user.email },
        include: {
          quotations: { orderBy: { createdAt: 'desc' } },
          subscriptions: { orderBy: { createdAt: 'desc' } },
          submissions: { orderBy: { createdAt: 'desc' } }
        }
      });
      
      if (!userObj) {
        return res.status(404).json({ error: "User not found" });
      }

      // Fetch email verification status
      const emailVerif = await prisma.emailVerification.findUnique({
        where: { email: userObj.email },
        select: { isVerified: true }
      });

      const { password: _, ...profile } = userObj;
      res.json({ ...profile, isEmailVerified: emailVerif?.isVerified || false });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Admin Middleware
  const requireSuperAdmin = (req: any, res: express.Response, next: express.NextFunction) => {
    if (req.user?.role !== "SuperAdmin") return res.status(403).json({ error: "Access denied" });
    next();
  };

  const requireAdminOrManager = (req: any, res: any, next: any) => {
    const role = req.user?.role;
    if (role !== 'SuperAdmin' && role !== 'SubscriptionManager') {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };

  const requireSalesRole = (req: any, res: any, next: any) => {
    const r = req.user?.role;
    if (r === "SuperAdmin" || r === "SubscriptionManager" || r === "SalesExecutive" || r === "SalesManager") {
      next();
    } else {
      res.status(403).json({ error: "Access denied. Requires sales role." });
    }
  };

  // --- Admin Email Settings API ---
  app.get("/api/admin/settings/email", authenticateJWT, requireAdminOrManager, (req, res) => {
    const settings = getSystemSettings();
    res.json({
      awsAccessKeyId: settings.awsAccessKeyId || "",
      awsSecretAccessKey: settings.awsSecretAccessKey ? "********" : "", // Masked
      awsRegion: settings.awsRegion || "us-west-2",
      emailFrom: settings.emailFrom || ""
    });
  });

  app.post("/api/admin/settings/email", authenticateJWT, requireAdminOrManager, (req, res) => {
    const settings = getSystemSettings();
    const { awsAccessKeyId, awsSecretAccessKey, awsRegion, emailFrom } = req.body;
    
    if (awsAccessKeyId) settings.awsAccessKeyId = awsAccessKeyId;
    // Only update secret if a new one is provided (not the masked one)
    if (awsSecretAccessKey && awsSecretAccessKey !== "********") {
      settings.awsSecretAccessKey = awsSecretAccessKey;
    }
    if (awsRegion) settings.awsRegion = awsRegion;
    if (emailFrom) settings.emailFrom = emailFrom;
    
    setSystemSettings(settings);
    res.json({ success: true, message: "Email settings saved successfully" });
  });

  app.post("/api/admin/settings/email/test", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { to } = req.body;
      if (!to) return res.status(400).json({ error: "Missing recipient email" });
      
      await sendMail({
        to,
        subject: "Test Email from STM Digital Library",
        html: `<p>This is a test email sent from the STM Digital Library Admin Dashboard.</p><p>If you received this, your email configuration is working perfectly!</p>`,
        _isTestEmail: true // Flag to throw error instead of swallowing
      });
      res.json({ success: true, message: "Test email sent successfully!" });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to send test email" });
    }
  });

  app.get("/api/admin/email-logs", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const logs = await prisma.emailLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100 // Limit to last 100 logs
      });
      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch email logs" });
    }
  });

  app.post("/api/admin/email-logs/:id/resend", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const logId = req.params.id;
      const log = await prisma.emailLog.findUnique({ where: { id: logId } });
      if (!log) return res.status(404).json({ error: "Log not found" });
      if (!log.htmlContent) return res.status(400).json({ error: "Email content not available for resending (older log without HTML stored)." });

      await sendMail({
        to: log.to,
        subject: log.subject,
        html: log.htmlContent,
        _isTestEmail: true // Throw error explicitly instead of silent catch
      }, false); // don't log this as a standard sent email initially since we do it below or it might spam

      // Update original log status
      await prisma.emailLog.update({
        where: { id: logId },
        data: { status: "Sent", error: null, createdAt: new Date() }
      });

      res.json({ success: true, message: "Email resent successfully!" });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to resend email" });
    }
  });

  // Admin: Get all stats (enhanced)
  app.get("/api/admin/stats", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const CONTENT_TYPES = ['Books','Periodicals','Magazines','Case Reports','Theses','Conference Proceedings','Educational Videos','Newsletters'];
      const [users, payments, subscriptions, quotations, contentCounts, pendingRequests, totalContent] = await Promise.all([
        prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
        prisma.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { user: true } }),
        prisma.subscription.findMany({ orderBy: { createdAt: 'desc' }, include: { user: true } }),
        prisma.quotation.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
        Promise.all(CONTENT_TYPES.map(async (ct) => ({
          name: ct,
          value: await prisma.content.count({ where: { contentType: ct } })
        }))),
        prisma.subscriptionRequest.count({ where: { status: 'Pending' } }),
        prisma.content.count()
      ]);

      const totalUsers = await prisma.user.count();
      const totalPublished = await prisma.content.count({ where: { status: { in: ['Published', 'published'] } } });
      const totalDrafted = await prisma.content.count({ where: { status: { notIn: ['Published', 'published'] } } });

      const now = new Date();
      const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      // Calculate real growth
      const currentMonthPayments = await prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'Success', createdAt: { gte: startOfCurrentMonth } }});
      const prevMonthPayments = await prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'Success', createdAt: { gte: startOfPreviousMonth, lt: startOfCurrentMonth } }});
      const currentRev = currentMonthPayments._sum.amount || 0;
      const prevRev = prevMonthPayments._sum.amount || 0;
      const revenueGrowthPct = prevRev === 0 ? (currentRev > 0 ? 100 : 0) : Number((((currentRev - prevRev) / prevRev) * 100).toFixed(1));

      const currentUsers = await prisma.user.count({ where: { createdAt: { gte: startOfCurrentMonth } }});
      const prevUsers = await prisma.user.count({ where: { createdAt: { gte: startOfPreviousMonth, lt: startOfCurrentMonth } }});
      const userGrowthPct = prevUsers === 0 ? (currentUsers > 0 ? 100 : 0) : Number((((currentUsers - prevUsers) / prevUsers) * 100).toFixed(1));

      // Aggregate domains for Bar Chart
      const domainGroups = await prisma.content.groupBy({
        by: ['domain'],
        _count: { id: true },
        where: { domain: { not: null } }
      });
      const domainsData = domainGroups.map(d => ({
        name: d.domain,
        count: d._count.id
      })).sort((a, b) => b.count - a.count).slice(0, 10); // Top 10 domains

      // Mock historical data since DB is likely lacking months of history
      const currentMonth = new Date().toLocaleString('default', { month: 'short' });
      const revenueData = [
        { name: 'Oct', revenue: 45000 }, { name: 'Nov', revenue: 52000 },
        { name: 'Dec', revenue: 48000 }, { name: 'Jan', revenue: 61000 },
        { name: 'Feb', revenue: 59000 }, { name: 'Mar', revenue: 75000 },
        { name: currentMonth, revenue: payments.filter(p => p.status === 'Success').reduce((acc, p) => acc + p.amount, 0) || 82000 }
      ];

      const userGrowthData = [
        { name: 'Oct', users: 120 }, { name: 'Nov', users: 145 },
        { name: 'Dec', users: 160 }, { name: 'Jan', users: 210 },
        { name: 'Feb', users: 250 }, { name: 'Mar', users: 310 },
        { name: currentMonth, users: totalUsers }
      ];

      const contentGrowthData = [
        { name: 'Oct', items: Math.floor(totalContent * 0.4) },
        { name: 'Nov', items: Math.floor(totalContent * 0.5) },
        { name: 'Dec', items: Math.floor(totalContent * 0.65) },
        { name: 'Jan', items: Math.floor(totalContent * 0.75) },
        { name: 'Feb', items: Math.floor(totalContent * 0.85) },
        { name: 'Mar', items: Math.floor(totalContent * 0.95) },
        { name: currentMonth, items: totalContent }
      ];

      // Geo map mock points for visual distribution (ISO-3 codes to weights)
      const geoPoints = [
        { id: "IND", value: 450, coordinates: [78.9629, 20.5937] }, // India
        { id: "USA", value: 320, coordinates: [-95.7129, 37.0902] }, // USA
        { id: "GBR", value: 180, coordinates: [-3.4359, 55.3781] }, // UK
        { id: "CAN", value: 150, coordinates: [-106.3468, 56.1304] }, // Canada
        { id: "AUS", value: 120, coordinates: [133.7751, -25.2744] }, // Australia
        { id: "DEU", value: 90, coordinates: [10.4515, 51.1657] } // Germany
      ];

      res.json({
        users, payments, subscriptions, quotations,
        contentTypeCounts: contentCounts.filter(c => c.value > 0),
        domainsData,
        revenueData,
        userGrowthData,
        contentGrowthData,
        geoPoints: [],
        _stats: {
          totalUsers,
          totalContent,
          totalPublished,
          totalDrafted,
          totalRevenue: payments.filter(p => p.status === 'Success').reduce((acc, p) => acc + p.amount, 0),
          activeSubscriptions: subscriptions.filter(s => s.status === 'Active').length,
          pendingRequests,
          contentGrowthPct: 0, // Not highly relevant unless explicitly tracking creation dates
          revenueGrowthPct,
          userGrowthPct
        }
      });
    } catch (error) {
      console.error("Admin stats error:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Admin: Get Settings
  app.get("/api/admin/settings", authenticateJWT, requireSuperAdmin, (req, res) => {
    res.json(getSystemSettings());
  });

  // Admin: Update Settings
  app.post("/api/admin/settings", authenticateJWT, requireSuperAdmin, (req, res) => {
    const { emailVerificationEnabled, publisherSafeMode, hidePricing } = req.body;
    const settings = getSystemSettings();
    if (typeof emailVerificationEnabled !== 'undefined') {
      settings.emailVerificationEnabled = Boolean(emailVerificationEnabled);
    }
    if (typeof publisherSafeMode !== 'undefined') {
      settings.publisherSafeMode = Boolean(publisherSafeMode);
    }
    if (typeof hidePricing !== 'undefined') {
      settings.hidePricing = Boolean(hidePricing);
    }
    setSystemSettings(settings);
    res.json(settings);
  });

  // India State-wise distribution — all sources + platform totals
  app.get("/api/admin/india-state-stats", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const [usersByState, quotationsByState, contactsByState, totalUsers, totalSubscriptions, totalRevenue] = await Promise.all([
        prisma.user.groupBy({ by: ['state'], _count: { id: true }, where: { state: { not: null, notIn: ['', 'null'] } } }),
        (prisma as any).quotation.groupBy({ by: ['state'], _count: { id: true }, where: { state: { not: null, notIn: ['', 'null'] } } }),
        (prisma as any).contactInquiry.groupBy({ by: ['state'], _count: { id: true }, where: { state: { not: null, notIn: ['', 'null'] } } }),
        prisma.user.count({ where: { role: { not: 'SuperAdmin' } } }),
        prisma.subscription.count({ where: { status: 'Active' } }),
        prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'Success' } }),
      ]);

      const stateMap: Record<string, { users: number; quotations: number; contacts: number; total: number }> = {};
      const add = (state: string | null, field: 'users' | 'quotations' | 'contacts', count: number) => {
        if (!state || state === 'null') return;
        const s = state.trim(); if (!s) return;
        if (!stateMap[s]) stateMap[s] = { users: 0, quotations: 0, contacts: 0, total: 0 };
        stateMap[s][field] += count; stateMap[s].total += count;
      };
      for (const u of usersByState)      add(u.state, 'users',      u._count.id);
      for (const q of quotationsByState) add(q.state, 'quotations', q._count.id);
      for (const c of contactsByState)   add(c.state, 'contacts',   c._count.id);

      res.json({
        stateMap,
        meta: {
          stateUsers:        usersByState.reduce((s: number, u: any) => s + u._count.id, 0),
          stateQuotations:   quotationsByState.reduce((s: number, q: any) => s + q._count.id, 0),
          stateContacts:     contactsByState.reduce((s: number, c: any) => s + c._count.id, 0),
          activeStates:      Object.keys(stateMap).length,
          totalUsers,
          totalSubscriptions,
          totalRevenue:      (totalRevenue as any)._sum?.amount || 0,
        }
      });
    } catch (error) {
      console.error("India state stats error:", error);
      res.status(500).json({ error: 'Failed to fetch state stats' });
    }
  });


  // ========================
  // SUBSCRIBER (USER) APIS
  // ========================

  app.get("/api/user/dashboard", authenticateJWT, async (req: any, res) => {
    try {
      const subscriptions = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);
      const payments = await prisma.payment.findMany({ where: { userId: req.user.uid, status: 'Success' } });
      const recentViews = await prisma.studentActivity.findMany({
        where: { userId: req.user.uid },
        orderBy: { accessedAt: 'desc' },
        take: 6,
        include: { content: true }
      });

      const mappedRecent = recentViews.map(rv => ({
        id: rv.contentId,
        title: rv.content?.title || "Unknown",
        type: rv.content?.contentType || "Book",
        domain: rv.content?.domain || "",
        lastPage: rv.lastPage || 1,
        date: rv.accessedAt.toISOString()
      }));

      const activeSubs = subscriptions;
      const nearestExpiry = activeSubs.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())[0]?.endDate || null;
      const totalSpent = payments.reduce((acc, p) => acc + p.amount, 0);

      // Fetch all subscriptions to find expired ones
      const OR_clauses: any[] = [{ userId: req.user.uid }];
      if (req.user.institutionId) {
        OR_clauses.push({ institutionId: req.user.institutionId });
      } else {
        const u = await prisma.user.findUnique({ where: { id: req.user.uid }, select: { institutionId: true } });
        if (u?.institutionId) OR_clauses.push({ institutionId: u.institutionId });
      }

      const allSubscriptions = await prisma.subscription.findMany({
        where: { OR: OR_clauses },
        orderBy: { endDate: 'desc' }
      });

      const expiredSubs = allSubscriptions.filter(sub => sub.status !== 'Active' || new Date(sub.endDate) < new Date());

      // Unique domains user has access to — read from the `domains` JSON array field
      const allowedDomains: string[] = Array.from(new Set(
        activeSubs.flatMap(s => {
          const d = Array.isArray(s.domains) ? s.domains : (s.domains ? JSON.parse(s.domains as string) : []);
          return d as string[];
        }).filter(Boolean)
      ));

      res.json({
        activeSubscriptions: activeSubs.length,
        nearestExpiry,
        totalSpent,
        allowedDomains,
        recentActivity: mappedRecent,
        planType: activeSubs[0]?.planType || 'Free/Demo',
        planName: activeSubs[0]?.planName || 'Basic Plan',
        expiredSubscriptions: expiredSubs
      });
    } catch (error) {
      console.error("User dashboard error:", error);
      res.status(500).json({ error: "Failed to load dashboard" });
    }
  });

  // GET /api/user/history — Get full reading history
  app.get("/api/user/history", authenticateJWT, async (req: any, res) => {
    try {
      const recentViews = await prisma.studentActivity.findMany({
        where: { userId: req.user.uid },
        orderBy: { accessedAt: 'desc' },
        take: 100,
        include: { content: true }
      });
      res.json(recentViews);
    } catch (error) {
      console.error("User history error:", error);
      res.status(500).json({ error: "Failed to load history" });
    }
  });

  // ── PATCH /api/user/reading-progress — save current page ────────────────────
  app.patch("/api/user/reading-progress", authenticateJWT, async (req: any, res) => {
    try {
      const { contentId, lastPage, timeSpent } = req.body;
      if (!contentId || !lastPage) return res.status(400).json({ error: "contentId and lastPage are required" });

      const existing = await prisma.studentActivity.findFirst({
        where: { userId: req.user.uid, contentId }
      });
      if (existing) {
        await prisma.studentActivity.update({
          where: { id: existing.id },
          data: { lastPage: Number(lastPage), timeSpent: { increment: Number(timeSpent) || 0 } }
        });
        res.json({ success: true, lastPage: Number(lastPage) });
      } else {
        await prisma.studentActivity.create({
          data: { userId: req.user.uid, contentId, lastPage: Number(lastPage), timeSpent: Number(timeSpent) || 0 }
        });
        res.json({ success: true, lastPage: Number(lastPage) });
      }
    } catch (error) {
      console.error("Reading progress save error:", error);
      res.status(500).json({ error: "Failed to save reading progress" });
    }
  });

  // ── GET /api/user/reading-progress/:contentId — get last page ────────────────
  app.get("/api/user/reading-progress/:contentId", authenticateJWT, async (req: any, res) => {
    try {
      const activity = await prisma.studentActivity.findFirst({
        where: { userId: req.user.uid, contentId: req.params.contentId }
      });
      res.json({ lastPage: activity?.lastPage || 1, accessedAt: activity?.accessedAt || null });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reading progress" });
    }
  });

  // ── FAVORITES (WISH LIST) ───────────────────────────────────────────────────
  // A saved item can live in Content, Article or Book, so which table it came
  // from is recorded on the row rather than enforced by a foreign key.
  const favouriteKindOf = async (id: string): Promise<'Content' | 'Article' | 'Book' | null> => {
    if (await prisma.content.count({ where: { id } })) return 'Content';
    if (await (prisma as any).article.count({ where: { id } })) return 'Article';
    if (await (prisma as any).book.count({ where: { id } })) return 'Book';
    return null;
  };

  app.get("/api/user/favorites", authenticateJWT, async (req: any, res) => {
    try {
      const favorites = await prisma.favorite.findMany({
        where: { userId: req.user.uid },
        orderBy: { createdAt: 'desc' }
      });
      if (!favorites.length) return res.json([]);

      // One query per table rather than one per saved item.
      const idsOf = (t: string) => favorites.filter((f: any) => f.itemType === t).map((f: any) => f.contentId);
      const [contents, articles, books] = await Promise.all([
        idsOf('Content').length ? prisma.content.findMany({ where: { id: { in: idsOf('Content') } } }) : [],
        idsOf('Article').length ? (prisma as any).article.findMany({ where: { id: { in: idsOf('Article') } } }) : [],
        idsOf('Book').length ? (prisma as any).book.findMany({ where: { id: { in: idsOf('Book') } } }) : [],
      ]);
      const byId = new Map<string, any>();
      for (const c of contents) byId.set(c.id, { ...c, itemType: 'Content' });
      for (const a of articles) byId.set(a.id, {
        ...a, itemType: 'Article',
        description: a.abstract || null,
        thumbnailUrl: null,
      });
      for (const b of books) byId.set(b.id, {
        ...b, itemType: 'Book',
        description: b.description || null,
        thumbnailUrl: b.coverUrl || null,
        contentType: 'Books',
      });

      // An item deleted since it was saved simply drops out of the list.
      res.json(favorites
        .map((f: any) => {
          const item = byId.get(f.contentId);
          return item ? { ...item, favoriteId: f.id, favoritedAt: f.createdAt } : null;
        })
        .filter(Boolean));
    } catch (error) {
      console.error("Favorites fetch error:", error);
      res.status(500).json({ error: "Failed to fetch favorites" });
    }
  });

  app.post("/api/user/favorites", authenticateJWT, async (req: any, res) => {
    try {
      const { contentId } = req.body;
      if (!contentId) return res.status(400).json({ error: "contentId is required" });

      const existing = await prisma.favorite.findFirst({
        where: { userId: req.user.uid, contentId }
      });

      if (existing) {
        await prisma.favorite.delete({ where: { id: existing.id } });
        return res.json({ success: true, favorited: false });
      }

      const itemType = await favouriteKindOf(contentId);
      if (!itemType) return res.status(404).json({ error: "That item no longer exists" });

      await prisma.favorite.create({
        data: { userId: req.user.uid, contentId, itemType }
      });
      return res.json({ success: true, favorited: true });
    } catch (error) {
      console.error("Favorite toggle error:", error);
      res.status(500).json({ error: "Failed to toggle favorite" });
    }
  });

  app.get("/api/user/favorites/check/:contentId", authenticateJWT, async (req: any, res) => {
    try {
      const existing = await prisma.favorite.findFirst({
        where: { userId: req.user.uid, contentId: req.params.contentId }
      });
      res.json({ favorited: !!existing });
    } catch (error) {
      res.status(500).json({ error: "Failed to check favorite status" });
    }
  });

  app.get("/api/user/subscriptions", authenticateJWT, async (req: any, res) => {
    try {
      const OR_clauses: any[] = [{ userId: req.user.uid }];
      
      // Use institutionId from JWT (set at login time on user record)
      if (req.user.institutionId) {
        OR_clauses.push({ institutionId: req.user.institutionId });
      } else if (req.user.role === 'Institution' || req.user.role === 'Student' || req.user.role === 'Subscriber') {
        // Fallback: load from DB if not in token
        const u = await prisma.user.findUnique({ where: { id: req.user.uid }, select: { institutionId: true } });
        if (u?.institutionId) OR_clauses.push({ institutionId: u.institutionId });
      }

      const subscriptions = await prisma.subscription.findMany({
        where: { OR: OR_clauses },
        orderBy: { startDate: 'desc' }
      });
      res.json(subscriptions);
    } catch (error) {
      res.status(500).json({ error: "Failed to load subscriptions" });
    }
  });

  // Helper to fetch valid subscriptions considering Institution inheritance
  const getUserActiveSubscriptions = async (uid: string, role: string, institutionId?: string | null) => {
    const OR_clauses: any[] = [{ userId: uid }];
    
    let resolvedInstId = institutionId;
    if (!resolvedInstId) {
      // Always look up from DB — JWT may not have institutionId for older tokens
      const u = await prisma.user.findUnique({ where: { id: uid }, select: { institutionId: true } });
      if (u?.institutionId) resolvedInstId = u.institutionId;
    }
    
    if (resolvedInstId) {
      OR_clauses.push({ institutionId: resolvedInstId });
    }
    
    return prisma.subscription.findMany({
      where: {
        OR: OR_clauses,
        status: 'Active',
        endDate: { gt: new Date() }
      }
    });
  };

  // Helper to check if a specific content object is accessible based on subscriptions
  const checkContentAccess = (content: any, userRole: string, activeSubscriptions: any[]) => {
    // Admins, content managers, and institution librarians see everything they cover
    if (userRole === 'SuperAdmin' || userRole === 'Admin' || userRole === 'ContentManager') return true;
    
    return activeSubscriptions.some(sub => {
      const d: string[] = Array.isArray(sub.domains)
        ? sub.domains as string[]
        : (sub.domains ? JSON.parse(sub.domains as string) : []);

      // If both domains array is empty AND domainName is empty, it's a wildcard (Full Access)
      const hasWildcardDomain = d.length === 0 && !sub.domainName;
      
      let domainMatch = false;
      if (hasWildcardDomain) {
        // Only institutions get wildcard access from an empty subscription,
        // OR if you want all users to get it, just set to true. Let's assume true for both.
        domainMatch = true;
      } else {
        const safeContentDomain = content.domain ? content.domain.toLowerCase() : "";
        domainMatch = d.some(subDomain => {
          if (!subDomain) return false;
          const safeSub = subDomain.toLowerCase();
          return safeSub.includes(safeContentDomain) || safeContentDomain.includes(safeSub);
        }) || (sub.domainName && (
          sub.domainName.toLowerCase().includes(safeContentDomain) || 
          safeContentDomain.includes(sub.domainName.toLowerCase())
        ));
      }

      if (!domainMatch) return false;

      // Parse contentTypes array
      const ct: string[] = Array.isArray(sub.contentTypes)
        ? sub.contentTypes as string[]
        : (sub.contentTypes ? JSON.parse(sub.contentTypes as string) : []);

      // If no contentTypes specified, allow all types for this domain
      if (ct.length === 0) return true;
      return ct.includes(content.contentType);
    });
  };

  app.get("/api/user/content-access", authenticateJWT, async (req: any, res) => {
    try {
      // 1. Get all active subscriptions for the user (including institution inheritance)
      const activeSubscriptions = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);

      // 2. Count what actually exists, across BOTH content datasets.
      //    Content holds the original library; Article/Book hold everything
      //    ingested since. Counting only Content made a department look nearly
      //    empty while the admin side showed hundreds of items.
      const [contentCounts, articleCounts, bookCounts] = await Promise.all([
        prisma.content.groupBy({
          by: ['domain', 'contentType'],
          _count: { id: true },
          where: { status: { in: ['Published', 'published'] } }
        }),
        (prisma as any).article.groupBy({
          by: ['domain', 'contentType'],
          _count: { id: true },
          where: { status: 'Published' }
        }),
        (prisma as any).book.groupBy({
          by: ['domain'],
          _count: { id: true },
          where: { status: 'Published' }
        }),
      ]);

      // 3. Merge into one count per (domain, contentType).
      //    Which dataset the count came from is kept, because Browse has to
      //    land the reader where the items actually are — a count drawn from
      //    Article that sent them to the archived shelf showed them nothing.
      type Row = { domain: string; contentType: string; totalCount: number; legacyCount: number; newCount: number };
      const totals = new Map<string, Row>();
      const addTo = (domain: any, contentType: any, n: number, which: 'legacy' | 'new') => {
        if (!domain || !contentType || !n) return;
        const key = `${domain}_${contentType}`;
        const row = totals.get(key) || { domain: String(domain), contentType: String(contentType), totalCount: 0, legacyCount: 0, newCount: 0 };
        row.totalCount += n;
        if (which === 'legacy') row.legacyCount += n; else row.newCount += n;
        totals.set(key, row);
      };

      for (const rc of contentCounts) addTo(rc.domain, rc.contentType, rc._count.id, 'legacy');
      for (const rc of articleCounts) addTo(rc.domain, rc.contentType, rc._count.id, 'new');
      // Book rows carry no contentType — they are all Books by definition.
      for (const rc of bookCounts)    addTo(rc.domain, 'Books', rc._count.id, 'new');

      const uniqueModules = Array.from(totals.values()).map(t => ({
        id: `${t.domain}_${t.contentType}`,
        domain: t.domain,
        contentType: t.contentType,
        totalCount: t.totalCount,
        legacyCount: t.legacyCount,
        newCount: t.newCount,
      }));

      // 4. Map status for each module to "locked" vs "unlocked"
      const accessMap = uniqueModules.map(mod => {
        const mockContent = { domain: mod.domain, contentType: mod.contentType };
        return {
          ...mod,
          hasAccess: checkContentAccess(mockContent, req.user.role, activeSubscriptions)
        };
      });

      // Group by domain for easier frontend rendering
      const grouped = accessMap.reduce((acc: any, curr) => {
        if (!acc[curr.domain]) acc[curr.domain] = [];
        acc[curr.domain].push(curr);
        return acc;
      }, {});

      res.json(grouped);
    } catch (error) {
      res.status(500).json({ error: "Failed to load access map" });
    }
  });

  // GET /api/user/access-scope — the departments + content types the user can actually access
  // (union of their active subscriptions). Admin/manager roles see everything (all:true).
  app.get("/api/user/access-scope", authenticateJWT, async (req: any, res) => {
    try {
      const role = req.user.role;
      if (['SuperAdmin', 'Admin', 'ContentManager'].includes(role)) {
        return res.json({ all: true, domains: [], contentTypes: [] });
      }
      const subs = await getUserActiveSubscriptions(req.user.uid, role, req.user.institutionId);
      const domains = new Set<string>();
      const contentTypes = new Set<string>();
      for (const s of (subs || [])) {
        const d = Array.isArray(s.domains) ? s.domains : (s.domains ? JSON.parse(s.domains as string) : []);
        const c = Array.isArray(s.contentTypes) ? s.contentTypes : (s.contentTypes ? JSON.parse(s.contentTypes as string) : []);
        d.forEach((x: string) => x && domains.add(x));
        c.forEach((x: string) => x && contentTypes.add(x));
        if (s.domainName) domains.add(s.domainName);
      }
      res.json({ all: false, domains: [...domains], contentTypes: [...contentTypes] });
    } catch (e: any) {
      console.error("access-scope error:", e);
      res.status(500).json({ error: "Failed to load access scope" });
    }
  });

  // GET /api/user/available-facets — departments + content types that the user can access
  // AND that actually have content. Prevents "no content found" dead-ends in filter dropdowns.
  app.get("/api/user/available-facets", authenticateJWT, async (req: any, res) => {
    try {
      const role = req.user.role;
      const isAdmin = ['SuperAdmin', 'Admin', 'ContentManager'].includes(role);
      const subs = isAdmin ? [] : ((await getUserActiveSubscriptions(req.user.uid, role, req.user.institutionId)) || []);

      const scopeDomains = new Set<string>(); const scopeTypes = new Set<string>();
      const subOr: any[] = [];
      for (const sub of subs) {
        const d = Array.isArray(sub.domains) ? sub.domains : (sub.domains ? JSON.parse(sub.domains as string) : []);
        const ct = Array.isArray(sub.contentTypes) ? sub.contentTypes : (sub.contentTypes ? JSON.parse(sub.contentTypes as string) : []);
        d.forEach((x: string) => x && scopeDomains.add(x));
        ct.forEach((x: string) => x && scopeTypes.add(x));
        if (sub.domainName) scopeDomains.add(sub.domainName);
        const cond: any = {}; const dOr: any[] = [];
        d.forEach((s: string) => s && dOr.push({ domain: { contains: s, mode: 'insensitive' } }));
        if (sub.domainName) dOr.push({ domain: { contains: sub.domainName, mode: 'insensitive' } });
        if (dOr.length) cond.OR = dOr;
        if (ct.length) cond.contentType = { in: ct };
        if (Object.keys(cond).length) subOr.push(cond);
      }

      // LEGACY unlocked content (My Library) — only depts/types the user actually has content for
      let legacyDepts: string[] = []; let legacyTypes: string[] = [];
      if (isAdmin || subs.length) {
        const legacyWhere: any = { status: { not: 'Draft' } };
        if (!isAdmin && subOr.length) legacyWhere.AND = [{ OR: subOr }];
        const [dg, cg] = await Promise.all([
          prisma.content.groupBy({ by: ['domain'], where: legacyWhere }),
          prisma.content.groupBy({ by: ['contentType'], where: legacyWhere }),
        ]);
        legacyDepts = dg.map((x: any) => x.domain).filter(Boolean);
        legacyTypes = cg.map((x: any) => x.contentType).filter(Boolean);
      }

      // NEW structured dataset (Journals & Books "New") — Article/Book within the user's scope
      const domFilter = isAdmin ? {} : { domain: { in: [...scopeDomains] } };
      const [aDepts, bDepts, aCount, bCount] = await Promise.all([
        (prisma as any).article.groupBy({ by: ['domain'], where: { status: 'Published', ...domFilter } }),
        (prisma as any).book.groupBy({ by: ['domain'], where: { status: 'Published', ...domFilter } }),
        (prisma as any).article.count({ where: { status: 'Published', ...domFilter } }),
        (prisma as any).book.count({ where: { status: 'Published', ...domFilter } }),
      ]);
      const newDepts = [...new Set([...aDepts.map((x: any) => x.domain), ...bDepts.map((x: any) => x.domain)].filter(Boolean))];

      // ARCHIVED — all published legacy content (browse the whole archive)
      const [adg, acg] = await Promise.all([
        prisma.content.groupBy({ by: ['domain'], where: { status: { not: 'Draft' } } }),
        prisma.content.groupBy({ by: ['contentType'], where: { status: { not: 'Draft' } } }),
      ]);

      res.json({
        all: isAdmin,
        scope: { domains: [...scopeDomains], contentTypes: [...scopeTypes] },
        legacy: { departments: legacyDepts, contentTypes: legacyTypes },
        neu: { departments: newDepts, hasArticles: aCount > 0, hasBooks: bCount > 0 && (isAdmin || scopeTypes.has('Books')) },
        archived: { departments: adg.map((x: any) => x.domain).filter(Boolean), contentTypes: acg.map((x: any) => x.contentType).filter(Boolean) },
      });
    } catch (e: any) { console.error("available-facets error:", e); res.status(500).json({ error: "Failed to load facets" }); }
  });

  // GET /api/content/filters - Get dynamic filters (subjectAreas and tags) for a specific domain
  app.get("/api/content/filters", async (req: any, res) => {
    try {
      const { domain, subjectArea, contentType, search } = req.query;
      const where: any = { status: "Published" };
      if (domain) {
        const domainList = String(domain).split(',').map(d => d.trim()).filter(Boolean);
        if (domainList.length > 1) {
          where.domain = { in: domainList };
        } else if (domainList.length === 1) {
          where.domain = domainList[0];
        }
      }
      if (contentType) where.contentType = String(contentType);
      
      if (search) {
        const query = String(search);
        where.OR = [
          { title: { contains: query, mode: 'insensitive' } },
          { authors: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { subjectArea: { contains: query, mode: 'insensitive' } }
        ];
      }

      // Optional subscription scoping: return facets ONLY from the user's UNLOCKED content,
      // so every subject/tag shown actually yields results when clicked.
      if (String(req.query.onlyUnlocked) === 'true') {
        const authHeader = req.headers.authorization;
        let ud: any = null;
        if (authHeader) { try { ud = jwt.verify(authHeader.split(' ')[1], JWT_SECRET); } catch { /* ignore */ } }
        if (ud && !['SuperAdmin', 'Admin', 'ContentManager'].includes(ud.role)) {
          const subs = await getUserActiveSubscriptions(ud.uid, ud.role, ud.institutionId);
          if (!subs.length) return res.json({ domains: [], subjects: [], tags: [] });
          const subOr: any[] = [];
          for (const sub of subs) {
            const d = Array.isArray(sub.domains) ? sub.domains : (sub.domains ? JSON.parse(sub.domains as string) : []);
            const ct = Array.isArray(sub.contentTypes) ? sub.contentTypes : (sub.contentTypes ? JSON.parse(sub.contentTypes as string) : []);
            const cond: any = {}; const dOr: any[] = [];
            d.forEach((s: string) => s && dOr.push({ domain: { contains: s, mode: 'insensitive' } }));
            if (sub.domainName) dOr.push({ domain: { contains: sub.domainName, mode: 'insensitive' } });
            if (dOr.length) cond.OR = dOr;
            if (ct.length) cond.contentType = { in: ct };
            if (Object.keys(cond).length) subOr.push(cond);
          }
          if (subOr.length) { where.AND = where.AND || []; where.AND.push({ OR: subOr }); }
        }
      }

      const contents = await prisma.content.findMany({
        where,
        select: { domain: true, subjectArea: true, tags: true },
      });

      const subjectsSet = new Set<string>();
      const tagsSet = new Set<string>();
      const domainsSet = new Set<string>();
      const selectedSubjects = subjectArea ? String(subjectArea).split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];

      contents.forEach((c: any) => {
        if (c.domain) domainsSet.add(c.domain.trim());
        if (c.subjectArea) subjectsSet.add(c.subjectArea.trim());
        
        let shouldAddTags = true;
        if (selectedSubjects.length > 0) {
          const cSub = c.subjectArea ? c.subjectArea.trim().toLowerCase() : "";
          if (!selectedSubjects.includes(cSub)) {
            shouldAddTags = false;
          }
        }

        if (shouldAddTags && c.tags) {
          const tagsArray = Array.isArray(c.tags) ? c.tags : (typeof c.tags === 'string' ? c.tags.split(',') : []);
          tagsArray.forEach((t: string) => {
            if (typeof t === 'string') {
              const trimmed = t.trim();
              if (trimmed) tagsSet.add(trimmed);
            }
          });
        }
      });

      res.json({
        domains: Array.from(domainsSet).sort(),
        subjects: Array.from(subjectsSet).sort(),
        tags: Array.from(tagsSet).sort()
      });
    } catch (error) {
      console.error("Filter fetch error:", error);
      res.status(500).json({ error: "Failed to fetch filters" });
    }
  });

  // GET /api/content/list - Lists all actual content items, with locked flags for regular users
  app.get("/api/content/list", async (req: any, res) => {
    try {
      const { domain, contentType, search, subjectArea, tag, page = "1", limit = "20", onlyUnlocked } = req.query;
      
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      const take = parseInt(limit as string);

      // Build prisma WHERE clause
      const where: any = { status: { not: "Draft" } };
      // domain may be a single value or a comma-joined list ("All Subscribed Domains")
      if (domain) {
        const doms = String(domain).split(',').map(s => s.trim()).filter(Boolean);
        if (doms.length === 1) where.domain = doms[0];
        else if (doms.length > 1) where.domain = { in: doms };
      }
      if (contentType) where.contentType = String(contentType);
      
      if (subjectArea) {
        const subjects = String(subjectArea).split(',').map(s => s.trim()).filter(Boolean);
        if (subjects.length > 0) {
          if (subjects.length === 1) {
            where.subjectArea = { equals: subjects[0], mode: "insensitive" };
          } else {
            where.subjectArea = { in: subjects };
          }
        }
      }

      if (tag) {
        const tags = String(tag).split(',').map(t => t.trim()).filter(Boolean);
        if (tags.length > 0) {
          if (tags.length === 1) {
            where.tags = { array_contains: tags[0] };
          } else {
            where.AND = where.AND || [];
            where.AND.push({
              OR: tags.map(t => ({ tags: { array_contains: t } }))
            });
          }
        }
      }

      if (search) {
        where.OR = [
          { title: { contains: String(search), mode: "insensitive" } },
          { authors: { contains: String(search), mode: "insensitive" } },
          { description: { contains: String(search), mode: "insensitive" } },
          { subjectArea: { contains: String(search), mode: "insensitive" } },
          { tags: { array_contains: String(search) } }
        ];
      }

      const authHeader = req.headers.authorization;
      let userDetails: any = null;
      if (authHeader) {
        const token = authHeader.split(' ')[1];
        try { userDetails = jwt.verify(token, JWT_SECRET); } catch(e) { console.log("JWT Error:", e); }
      }


      if (onlyUnlocked === "true" && userDetails) {
        if (userDetails.role !== 'SuperAdmin' && userDetails.role !== 'Admin' && userDetails.role !== 'ContentManager') {
          const activeSubs = await getUserActiveSubscriptions(userDetails.uid, userDetails.role, userDetails.institutionId);
          
          if (activeSubs.length === 0) {
            return res.json({ data: [], total: 0, page: parseInt(page as string), limit: take });
          }

          const subOrConditions: any[] = [];
          
          for (const sub of activeSubs) {
            const d = Array.isArray(sub.domains) ? sub.domains : (sub.domains ? JSON.parse(sub.domains as string) : []);
            const ct = Array.isArray(sub.contentTypes) ? sub.contentTypes : (sub.contentTypes ? JSON.parse(sub.contentTypes as string) : []);
            
            const condition: any = {};
            const domainOr: any[] = [];
            
            if (d.length > 0) {
              d.forEach((domainStr: string) => {
                if (domainStr) domainOr.push({ domain: { contains: domainStr, mode: 'insensitive' } });
              });
            }
            if (sub.domainName) {
               domainOr.push({ domain: { contains: sub.domainName, mode: 'insensitive' } });
            }
            
            if (domainOr.length > 0) {
              condition.OR = domainOr;
            }
            
            if (ct.length > 0) {
              condition.contentType = { in: ct };
            }
            
            if (Object.keys(condition).length === 0) {
              subOrConditions.push({}); 
            } else {
              subOrConditions.push(condition);
            }
          }
          
          if (subOrConditions.length > 0) {
            const hasWildcard = subOrConditions.some(c => Object.keys(c).length === 0);
            if (!hasWildcard) {
               where.AND = where.AND || [];
               where.AND.push({ OR: subOrConditions });
            }
          }
        }
        
        const [contents, total] = await Promise.all([
          prisma.content.findMany({ where, skip, take, orderBy: { title: 'asc' } }),
          prisma.content.count({ where })
        ]);

        return res.json({ 
          data: contents.map(c => ({ ...c, locked: false })), 
          total, 
          page: parseInt(page as string), 
          limit: take 
        });
      }

      const [contents, total] = await Promise.all([
        prisma.content.findMany({ where, skip, take, orderBy: { title: 'asc' } }),
        prisma.content.count({ where })
      ]);

      if (!userDetails) {
        return res.json({
          data: contents.map(c => ({ ...c, locked: true, fileUrl: null })),
          total, page: parseInt(page as string), limit: take
        });
      }

      const activeSubs = await getUserActiveSubscriptions(userDetails.uid, userDetails.role, userDetails.institutionId);

      // Map contents and strip URLs for locked items
      const protectedContents = contents.map(c => {
        const hasAccess = checkContentAccess(c, userDetails.role, activeSubs);
        if (!hasAccess) {
          // Hide sensitive URL and mark locked
          return { ...c, fileUrl: null, locked: true };
        }
        return { ...c, locked: false };
      });

      res.json({ data: protectedContents, total, page: parseInt(page), limit: take });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to load content list" });
    }
  });

  // Resolve a viewable item by id from legacy Content OR the new structured dataset (Article/Book).
  // Lets the existing protected viewer open new content transparently. New OA items are freely accessible.
  const resolveViewable = async (id: string, isAdmin: boolean) => {
    const c = await prisma.content.findFirst({ where: isAdmin ? { id } : { id, status: { not: 'Draft' } } });
    if (c) return { kind: 'content' as const, item: c, fileUrl: c.fileUrl, title: c.title, contentType: c.contentType, accessType: c.accessType, status: c.status };
    const a = await (prisma as any).article.findFirst({ where: isAdmin ? { id } : { id, status: 'Published' } });
    if (a) return { kind: 'article' as const, item: a, fileUrl: a.pdfUrl, title: a.title, contentType: a.contentType || 'Periodicals', accessType: a.accessType || 'OpenAccess', status: a.status };
    const b = await (prisma as any).book.findFirst({ where: isAdmin ? { id } : { id, status: 'Published' } });
    if (b) return { kind: 'book' as const, item: b, fileUrl: b.pdfUrl, title: b.title, contentType: 'Books', accessType: b.accessType || 'OpenAccess', status: b.status };
    return null;
  };

  // GET /api/content/:id/view - Protected endpoint to securely view content and auto-track activity
  app.get("/api/content/:id/view", authenticateJWT, async (req: any, res) => {
    try {
      const contentId = req.params.id;
      const isAdminRole = ['SuperAdmin', 'Admin', 'ContentManager'].includes(req.user.role);
      const resolved = await resolveViewable(contentId, isAdminRole);
      if (!resolved) return res.status(404).json({ error: "Content not found" });

      // New-dataset OA items are freely viewable; legacy content uses subscription checks.
      const isOA = ['OpenAccess', 'Free'].includes(resolved.accessType || '');
      let hasAccess = true;
      if (resolved.kind === 'content' && !isOA) {
        const activeSubs = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);
        hasAccess = checkContentAccess(resolved.item, req.user.role, activeSubs);
      }
      if (!hasAccess) return res.status(403).json({ error: "Access denied. Please upgrade your subscription." });

      // Impact analytics: count a read on new-dataset items (skip admin previews)
      if ((resolved.kind === 'article' || resolved.kind === 'book') && !isAdminRole) {
        (prisma as any)[resolved.kind].update({ where: { id: resolved.item.id }, data: { views: { increment: 1 } } }).catch(() => {});
        (prisma as any).readEvent.create({ data: { itemType: resolved.kind, itemId: resolved.item.id, publisherId: (resolved.item as any).publisherId || null, userId: req.user.uid } }).catch(() => {});
      }

      // Activity logging only for legacy content (StudentActivity.contentId FKs to Content)
      if (resolved.kind === 'content' && (req.user.role === 'Student' || req.user.role === 'Subscriber')) {
        try {
          const existing = await prisma.studentActivity.findFirst({ where: { userId: req.user.uid, contentId: resolved.item.id } });
          if (existing) await prisma.studentActivity.update({ where: { id: existing.id }, data: { accessedAt: new Date() } });
          else await prisma.studentActivity.create({ data: { userId: req.user.uid, contentId: resolved.item.id, timeSpent: 0, lastPage: 1 } });
        } catch (e) { console.error('Activity log failed', e); }
      }

      // The reader also carries a way back into the catalogue — the journal it
      // came from, and the full record — so no page in the library is a dead end.
      const it: any = resolved.item;
      return res.json({
        url: resolved.fileUrl,
        title: resolved.title,
        contentType: resolved.contentType,
        kind: resolved.kind,
        journalName: it.journalName ?? null,
        journalIssn: normaliseIssn(it.journalIssn) ?? null,
        year: it.year ?? null,
        volume: it.volume ?? null,
        issue: it.issue ?? null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to view content" });
    }
  });

  // GET /api/content/:id/proxy-pdf — streams the PDF server-side to bypass browser CORS
  app.get("/api/content/:id/proxy-pdf", authenticateJWT, async (req: any, res) => {
    try {
      const contentId = req.params.id;
      // Admins bypass subscription checks — they can preview any content for validation
      const isAdmin = req.user.role === 'SuperAdmin' || req.user.role === 'Admin';
      
      const resolved = await resolveViewable(contentId, isAdmin);
      if (!resolved || !resolved.fileUrl) {
        return res.status(404).json({ error: "Content not found" });
      }
      const content: any = resolved.item;
      content.fileUrl = resolved.fileUrl;
      const isOA = ['OpenAccess', 'Free'].includes(resolved.accessType || '');
      if (!isAdmin && resolved.kind === 'content' && !isOA) {
        const activeSubs = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);
        const hasAccess = checkContentAccess(content, req.user.role, activeSubs);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied." });
        }
      }

      // If it's a local relative URL, serve it directly from the public folder
      if (content.fileUrl.startsWith('/')) {
        const localPath = path.join(process.cwd(), 'public', content.fileUrl);
        if (fs.existsSync(localPath)) {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'inline');
          res.setHeader('Cache-Control', 'private, max-age=3600');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          return res.sendFile(localPath);
        } else {
          console.warn(`[proxy-pdf] Auto-flagging missing local file: ${content.fileUrl}`);
          if (resolved.kind === 'content') {
            await prisma.content.update({
               where: { id: contentId },
               data: { status: 'Draft', validationStatus: 'FLAGGED_CONTENT', isViewable: false, flaggedReason: 'Local file missing (404)' }
            });
          }
          return res.status(404).json({ error: "Local file not found" });
        }
      }

      // Use node-fetch to stream PDF — handles keep-alive, redirects and socket issues correctly.
      const nodeFetch = (await import('node-fetch')).default;

      const proxyHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
      };

      // Forward range requests from pdf.js so chunked loading works
      if (req.headers['range']) {
        proxyHeaders['Range'] = req.headers['range'] as string;
      }

      const controller = new AbortController();
      req.on('close', () => controller.abort());

      const upstreamRes = await nodeFetch(content.fileUrl, {
        headers: proxyHeaders,
        redirect: 'follow',
        signal: controller.signal as any,
      }).catch((err: any) => {
        if (err.name === 'AbortError') return null;
        throw err;
      });

      if (!upstreamRes) return; // client disconnected

      if (!upstreamRes.ok) {
        console.error(`[proxy-pdf] Upstream failed with ${upstreamRes.status} for ${content.fileUrl}`);
        if (upstreamRes.status === 403 || upstreamRes.status === 404 || upstreamRes.status >= 500) {
          await prisma.content.update({
             where: { id: contentId },
             data: { status: 'Draft', validationStatus: 'FLAGGED_CONTENT', isViewable: false, flaggedReason: `Upstream failed with ${upstreamRes.status}` }
          });
        }
        if (!res.headersSent) res.status(upstreamRes.status).json({ error: `Upstream returned ${upstreamRes.status}` });
        return;
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (upstreamRes.headers.get('content-length')) {
        res.setHeader('Content-Length', upstreamRes.headers.get('content-length')!);
      }
      if (upstreamRes.headers.get('content-range')) {
        res.setHeader('Content-Range', upstreamRes.headers.get('content-range')!);
        res.status(206);
      }

      (upstreamRes.body as any).pipe(res);

    } catch (error) {
      console.error('[proxy-pdf] unexpected error:', error);
      res.status(500).json({ error: "PDF proxy failed" });
    }
  });

  // GET /api/content/:id/proxy-frame — streams web/HTML content, stripping X-Frame-Options to allow iframing
  app.get("/api/content/:id/proxy-frame", authenticateJWT, async (req: any, res) => {
    try {
      const contentId = req.params.id;
      const isAdmin = req.user.role === 'SuperAdmin' || req.user.role === 'Admin';
      
      // This read only Content, so every article from the new collection came
      // back "Content not found" — and the iframe rendered that JSON as text.
      const resolved = await resolveViewable(contentId, isAdmin);
      if (!resolved || !resolved.fileUrl) {
        return res.status(404).json({ error: "Content not found" });
      }
      const content: any = { ...resolved.item, fileUrl: resolved.fileUrl };

      const isOA = ['OpenAccess', 'Free'].includes(resolved.accessType || '');
      if (!isAdmin && resolved.kind === 'content' && !isOA) {
        const activeSubs = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);
        const hasAccess = checkContentAccess(content, req.user.role, activeSubs);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied." });
        }
      }

      if (content.fileUrl.startsWith('/')) {
        const filePath = path.join(process.cwd(), 'dist', content.fileUrl);
        if (!fs.existsSync(filePath)) {
          console.warn(`[proxy-frame] Missing local file: ${content.fileUrl}`);
          if (resolved.kind === 'content') {
            await prisma.content.update({
               where: { id: contentId },
               data: { status: 'Draft', validationStatus: 'FLAGGED_CONTENT', isViewable: false, flaggedReason: 'Local file missing (404)' }
            });
          }
          return res.status(404).json({ error: "File not found" });
        }
        return res.redirect(content.fileUrl);
      }

      const nodeFetch = (await import('node-fetch')).default;
      const controller = new AbortController();
      req.on('close', () => controller.abort());

      const upstreamRes = await nodeFetch(content.fileUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'en-US,en;q=0.9',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0'
        },
        redirect: 'follow',
        signal: controller.signal as any
      }).catch((err: any) => {
        if (err.name === 'AbortError') return null;
        throw err;
      });

      if (!upstreamRes) return; // Client disconnected

      if (!upstreamRes.ok && (upstreamRes.status === 403 || upstreamRes.status === 404 || upstreamRes.status >= 500)) {
        await prisma.content.update({
           where: { id: contentId },
           data: { status: 'Draft', validationStatus: 'FLAGGED_CONTENT', isViewable: false, flaggedReason: `Upstream failed with ${upstreamRes.status}` }
        });
      }

      const contentType = upstreamRes.headers.get('content-type') || '';

      // Strip frame-restricting headers
      upstreamRes.headers.forEach((value: string, key: string) => {
        const lowerKey = key.toLowerCase();
        if (!['x-frame-options', 'content-security-policy', 'content-security-policy-report-only', 'cross-origin-opener-policy', 'cross-origin-resource-policy', 'cross-origin-embedder-policy'].includes(lowerKey)) {
          res.setHeader(key, value);
        }
      });

      // Always pass the status code back
      res.status(upstreamRes.status);

      // Inject <base> tag into HTML to fix relative URLs
      if (contentType.includes('text/html')) {
        let html = await upstreamRes.text();
        const baseUrl = new URL(upstreamRes.url).origin;
        html = html.replace(/<head[^>]*>/i, `$&<base href="${baseUrl}/">`);
        return res.send(html);
      } else {
        (upstreamRes.body as any).pipe(res);
      }

    } catch (error) {
      console.error('[proxy-frame] unexpected error:', error);
      res.status(500).send("Frame proxy failed");
    }
  });

  app.get("/api/user/quotations", authenticateJWT, async (req: any, res) => {
    try {
      const quotations = await (prisma as any).quotation.findMany({
        where: { userEmail: req.user.email },
        orderBy: { createdAt: 'desc' }
      });
      res.json(quotations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch quotations" });
    }
  });

  // Quotations *raised by* the signed-in staff member, as opposed to
  // /api/user/quotations, which returns quotations addressed *to* a customer.
  // Scoped to the caller's own email, so it is safe for any signed-in role:
  // you can only ever see what you produced.
  app.get("/api/my/quotations", authenticateJWT, async (req: any, res) => {
    try {
      const email = req.user?.email;
      if (!email) return res.json({ quotations: [], stats: { total: 0, paid: 0, pending: 0, value: 0 } });

      const { status, search } = req.query;
      const where: any = { createdBy: email };
      if (status && status !== 'All') where.status = status as string;
      if (search) {
        where.OR = [
          { id:           { contains: search as string, mode: 'insensitive' } },
          { userName:     { contains: search as string, mode: 'insensitive' } },
          { userEmail:    { contains: search as string, mode: 'insensitive' } },
          { organization: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      const quotations = await (prisma as any).quotation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      // Totals are over everything this person raised, not the filtered view,
      // so the header numbers do not move around while searching.
      const all = await (prisma as any).quotation.findMany({
        where: { createdBy: email },
        select: { status: true, total: true },
      });
      const stats = {
        total:   all.length,
        paid:    all.filter((q: any) => q.status === 'Paid').length,
        pending: all.filter((q: any) => !['Paid', 'Cancelled'].includes(q.status)).length,
        value:   all.filter((q: any) => q.status === 'Paid').reduce((n: number, q: any) => n + (q.total || 0), 0),
      };

      res.json({ quotations, stats });
    } catch (error) {
      console.error('GET /api/my/quotations error:', error);
      res.status(500).json({ error: 'Failed to fetch your quotations' });
    }
  });

  app.get("/api/user/invoices", authenticateJWT, async (req: any, res) => {
    try {
      const payments = await prisma.payment.findMany({
        where: { userId: req.user.uid },
        orderBy: { createdAt: 'desc' }
      });
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: "Failed to load invoices" });
    }
  });

  // Self-update: name, password, clears isFirstLogin
  app.put("/api/user/profile", authenticateJWT, async (req: any, res) => {
    try {
      const { displayName, password, clearFirstLogin } = req.body;
      const dataToUpdate: any = {};
      if (displayName) dataToUpdate.displayName = displayName;
      if (password) {
        dataToUpdate.password = await bcrypt.hash(password, 10);
      }
      if (clearFirstLogin || password) {
        dataToUpdate.isFirstLogin = false;
      }
      const updatedUser = await prisma.user.update({
        where: { id: req.user.uid },
        data: dataToUpdate
      });
      const { password: _, ...profile } = updatedUser;
      res.json({ message: "Profile updated successfully", user: profile });
    } catch (error) {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // DPDP / GDPR Right to Erasure
  app.delete("/api/user/account", authenticateJWT, async (req: any, res) => {
    try {
      // Note: In Prisma, depending on cascade settings, this deletes the user and associated data.
      await prisma.user.delete({
        where: { id: req.user.uid }
      });
      res.json({ message: "Account deleted successfully" });
    } catch (error) {
      console.error("Failed to delete account", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // ======================================================
  // USER MANAGEMENT — SuperAdmin + SubscriptionManager only
  // ======================================================

  

  // Helper: generate strong random password (alphanumeric only — avoids email copy-paste issues with special chars)
  const generatePassword = (length = 12): string => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from(crypto.randomBytes(length))
      .map((b: any) => chars[b % chars.length])
      .join('');
  };

  // Helper: send credentials email
  const sendCredentialsEmail = async (
    to: string,
    name: string,
    password: string,
    extra?: {
      institution?: string;
      department?: string;
      planName?: string;
      validity?: string;
      customMessage?: string;
    }
  ) => {
    const siteUrl = process.env.SITE_URL || 'https://journalslibrary.com';
    const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
    try {
      await sendMail({
        from: `"STM Digital Library" <${emailFrom}>`,
        to,
        subject: 'Your STM Digital Library Access Credentials',
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Your STM Digital Library Access Credentials</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF2F7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F7;padding:30px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.10);">

        <!-- TOP ACCENT BAR -->
        <tr><td style="background:linear-gradient(90deg,#1A3A6B 0%,#2563EB 100%);height:6px;font-size:0;">&nbsp;</td></tr>

        <!-- HEADER -->
        <tr>
          <td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid #E8EDF4;">
            <img src="https://journalslibrary.com/logo.png" alt="STM Logo" width="60" height="60" style="display:inline-block;margin-bottom:14px;" onerror="this.style.display='none'"/>
            <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#1A3A6B;letter-spacing:-0.3px;">STM Digital Library</h1>
            <p style="margin:0;font-size:12px;color:#6B7A99;font-weight:400;">${COMPANY_DETAILS.positioning}</p>
          </td>
        </tr>

        <!-- GREETING -->
        <tr>
          <td style="padding:28px 40px 0;">
            <p style="margin:0 0 6px;font-size:13px;color:#2563EB;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">Greetings from STM Digital Library</p>
            <p style="margin:0 0 14px;font-size:20px;font-weight:700;color:#1A3A6B;">Dear ${name},</p>
            <p style="margin:0 0 10px;font-size:14px;color:#4A5568;line-height:1.7;">
              ${extra?.customMessage || 'We are pleased to inform you that your subscription access has been <span style="color:#16A34A;font-weight:700;">successfully activated</span>.'}
            </p>
            <p style="margin:0;font-size:14px;color:#4A5568;line-height:1.7;">
              You can now log in to the STM Digital Library platform using the credentials provided below.
            </p>
          </td>
        </tr>

        <!-- CREDENTIALS CARD -->
        <tr>
          <td style="padding:24px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0F5FF;border:1px solid #C7D9F8;border-radius:10px;overflow:hidden;">
              <!-- Card Title -->
              <tr>
                <td colspan="2" style="background:#1A3A6B;padding:12px 20px;">
                  <p style="margin:0;font-size:12px;font-weight:700;color:#FFFFFF;letter-spacing:1px;text-transform:uppercase;">&#128272; Login Credentials</p>
                </td>
              </tr>
              <!-- Login URL -->
              <tr>
                <td style="padding:14px 20px 0;vertical-align:top;width:42%;">
                  <p style="margin:0;font-size:11px;color:#6B7A99;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">&#127760; Login URL</p>
                </td>
                <td style="padding:14px 20px 0;vertical-align:top;">
                  <a href="${siteUrl}/login" style="color:#2563EB;font-size:13px;font-weight:700;text-decoration:none;">${siteUrl}/login</a>
                </td>
              </tr>
              <!-- Divider -->
              <tr><td colspan="2" style="padding:10px 20px 0;"><div style="height:1px;background:#D1DFF8;"></div></td></tr>
              <!-- Username -->
              <tr>
                <td style="padding:12px 20px 0;vertical-align:top;">
                  <p style="margin:0;font-size:11px;color:#6B7A99;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">&#128100; Username</p>
                </td>
                <td style="padding:12px 20px 0;vertical-align:top;">
                  <p style="margin:0;font-size:13px;font-weight:700;color:#1A3A6B;">${to}</p>
                </td>
              </tr>
              <!-- Divider -->
              <tr><td colspan="2" style="padding:10px 20px 0;"><div style="height:1px;background:#D1DFF8;"></div></td></tr>
              <!-- Password -->
              <tr>
                <td style="padding:12px 20px 18px;vertical-align:middle;">
                  <p style="margin:0;font-size:11px;color:#6B7A99;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">&#128273; Temporary Password</p>
                </td>
                <td style="padding:12px 20px 18px;vertical-align:middle;">
                  <span style="display:inline-block;background:#1A3A6B;color:#60C2F8;font-family:'Courier New',monospace;font-size:15px;font-weight:700;letter-spacing:2px;padding:7px 16px;border-radius:6px;">${password}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- SECURITY NOTICE -->
        <tr>
          <td style="padding:0 40px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFBEB;border:1px solid #FCD34D;border-left:4px solid #F59E0B;border-radius:8px;">
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#92400E;">&#9888;&#65039; Important Security Instructions</p>
                  <p style="margin:0 0 4px;font-size:12px;color:#78350F;line-height:1.7;">For security purposes:</p>
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr><td style="padding:2px 0;font-size:12px;color:#78350F;">&#8226;&nbsp; This is a <strong>temporary password</strong></td></tr>
                    <tr><td style="padding:2px 0;font-size:12px;color:#78350F;">&#8226;&nbsp; You will be prompted to <strong>change your password</strong> after first login</td></tr>
                    <tr><td style="padding:2px 0;font-size:12px;color:#78350F;">&#8226;&nbsp; Please keep your login credentials <strong>confidential</strong></td></tr>
                    <tr><td style="padding:2px 0;font-size:12px;color:#78350F;">&#8226;&nbsp; Do not share access outside your institution/organization</td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${extra && (extra.institution || extra.department || extra.planName || extra.validity) ? `
        <!-- SUBSCRIPTION DETAILS -->
        <tr>
          <td style="padding:0 40px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;">
              <tr>
                <td colspan="2" style="background:#1A3A6B;padding:12px 20px;">
                  <p style="margin:0;font-size:12px;font-weight:700;color:#FFFFFF;letter-spacing:1px;text-transform:uppercase;">&#128218; Subscription Details</p>
                </td>
              </tr>
              ${extra.institution ? `<tr style="border-bottom:1px solid #EEF2F7;">
                <td style="padding:11px 20px;font-size:12px;color:#6B7A99;font-weight:600;width:48%;">Institution / Organization</td>
                <td style="padding:11px 20px;font-size:13px;color:#1A3A6B;font-weight:700;">${extra.institution}</td>
              </tr>` : ''}
              ${extra.department ? `<tr style="border-bottom:1px solid #EEF2F7;">
                <td style="padding:11px 20px;font-size:12px;color:#6B7A99;font-weight:600;">Department Access</td>
                <td style="padding:11px 20px;font-size:13px;color:#1A3A6B;font-weight:700;">${extra.department}</td>
              </tr>` : ''}
              ${extra.planName ? `<tr style="border-bottom:1px solid #EEF2F7;">
                <td style="padding:11px 20px;font-size:12px;color:#6B7A99;font-weight:600;">Subscription Plan</td>
                <td style="padding:11px 20px;font-size:13px;color:#1A3A6B;font-weight:700;">${extra.planName}</td>
              </tr>` : ''}
              ${extra.validity ? `<tr>
                <td style="padding:11px 20px;font-size:12px;color:#6B7A99;font-weight:600;">Validity</td>
                <td style="padding:11px 20px;font-size:13px;color:#16A34A;font-weight:700;">${extra.validity}</td>
              </tr>` : ''}
            </table>
          </td>
        </tr>` : ''}

        <!-- SUPPORT -->
        <tr>
          <td style="padding:0 40px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1E40AF;">&#128295; Need Assistance?</p>
                  <p style="margin:0 0 10px;font-size:12px;color:#3B5FBF;line-height:1.6;">If you face any issues related to login, access, or subscription, please contact us:</p>
                  <p style="margin:0 0 4px;font-size:13px;color:#1E40AF;">&#128231;&nbsp;<a href="mailto:${COMPANY_DETAILS.email}" style="color:#2563EB;font-weight:700;text-decoration:none;">${COMPANY_DETAILS.email}</a></p>
                  <p style="margin:0;font-size:13px;color:#1E40AF;">&#128222;&nbsp;<a href="tel:+919810078958" style="color:#2563EB;font-weight:700;text-decoration:none;">+91-9810078958</a></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#1A3A6B;padding:24px 40px;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#FCD34D;letter-spacing:0.5px;text-transform:uppercase;">&#127942; 21 Years of Trusted Excellence in Education &amp; Academic Publishing</p>
            <p style="margin:0 0 4px;font-size:13px;color:#CBD5E1;">Regards,</p>
            <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#FFFFFF;">STM Digital Library Team</p>
            <p style="margin:0 0 16px;font-size:12px;color:#94A3B8;">${COMPANY_DETAILS.positioning}</p>
            <div style="height:1px;background:#2D5299;margin-bottom:14px;"></div>
            <p style="margin:0;font-size:11px;color:#64748B;">
              &copy; ${new Date().getFullYear()} STM Digital Library. All rights reserved.&nbsp;|&nbsp;
              <a href="${siteUrl}/privacy-policy" style="color:#93C5FD;text-decoration:none;">Privacy Policy</a>&nbsp;|&nbsp;
              <a href="${siteUrl}/terms-and-conditions" style="color:#93C5FD;text-decoration:none;">Terms &amp; Conditions</a>
            </p>
          </td>
        </tr>

        <!-- BOTTOM ACCENT BAR -->
        <tr><td style="background:linear-gradient(90deg,#2563EB 0%,#1A3A6B 100%);height:4px;font-size:0;">&nbsp;</td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
      });
    } catch (emailErr: any) {
      console.error("Credentials email failed for:", to);
      console.error("Error details:", emailErr.message || emailErr);
      if (emailErr.stack) console.error(emailErr.stack);
      // Non-blocking: user is still created
    }
  };

  // Helper: Send comprehensive rich-HTML payment success emails (Customer + Admin)
  const sendPaymentSuccessEmails = async (
    userEmail: string,
    userName: string,
    totalAmount: string,
    items: any[],
    paymentId: string,
    orderId: string,
    invoiceNumber: string,
    pdfBase64?: string
  ) => {
    const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
    const adminEmail = process.env.ADMIN_EMAIL || COMPANY_DETAILS.email;
    const year = new Date().getFullYear();

    const itemsHtml = Array.isArray(items) ? items.map((item: any) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;font-weight:600;">${item.domainName || item.description || 'Subscription'}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center;">${item.planName || '—'}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center;">${item.duration || 'Monthly'}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;font-weight:700;text-align:right;">₹${Number(item.price || item.unitPrice || 0).toLocaleString('en-IN')}</td>
      </tr>`).join('') : '<tr><td colspan="4" style="padding:12px;text-align:center;color:#94a3b8;">No items</td></tr>';

    const customerHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:32px 0;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);max-width:620px;">
  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a6e 100%);padding:32px 48px 28px;text-align:center;">
    <h1 style="color:#ffffff;margin:0 0 4px;font-size:24px;font-weight:900;letter-spacing:1px;">STM DIGITAL LIBRARY</h1>
    <p style="color:#93c5fd;margin:0 0 16px;font-size:12px;">${COMPANY_DETAILS.positioning}</p>
    <span style="display:inline-block;background:#15803d;color:#ffffff;font-size:11px;font-weight:700;border-radius:30px;padding:6px 20px;">✅ &nbsp;Payment Confirmed</span>
  </td></tr>
  <!-- Success Banner -->
  <tr><td style="background:#f0fdf4;border-bottom:2px solid #bbf7d0;padding:22px 48px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:28px;">✅</td>
      <td style="padding-left:14px;">
        <p style="margin:0;font-size:17px;font-weight:800;color:#15803d;">Payment Successful!</p>
        <p style="margin:4px 0 0;font-size:13px;color:#166534;">Thank you, ${userName}. Your subscription is now active.</p>
      </td>
      <td style="text-align:right;">
        <p style="margin:0;font-size:26px;font-weight:900;color:#15803d;">₹${totalAmount}</p>
        <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">incl. 18% GST</p>
      </td>
    </tr></table>
  </td></tr>
  <!-- Invoice Details -->
  <tr><td style="padding:28px 48px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1d4ed8,#1e40af);border-radius:12px;">
    <tr><td style="padding:18px 24px;">
      <p style="color:#bfdbfe;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 14px;">📄 &nbsp;Invoice Details</p>
      <table width="100%" cellpadding="0" cellspacing="0"><tbody>
        <tr>
          <td style="color:#93c5fd;font-size:12px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.1);width:50%;">Invoice Number</td>
          <td style="color:#fff;font-size:13px;font-weight:700;text-align:right;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.1);">${invoiceNumber}</td>
        </tr>
        <tr>
          <td style="color:#93c5fd;font-size:12px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.1);">Payment ID</td>
          <td style="color:#fff;font-size:12px;font-weight:600;text-align:right;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.1);font-family:monospace;">${paymentId || '—'}</td>
        </tr>
        <tr>
          <td style="color:#93c5fd;font-size:12px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.1);">Order ID</td>
          <td style="color:#fff;font-size:12px;font-weight:600;text-align:right;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.1);font-family:monospace;">${orderId || '—'}</td>
        </tr>
        <tr>
          <td style="color:#93c5fd;font-size:12px;padding:5px 0;">Date</td>
          <td style="color:#fff;font-size:13px;font-weight:600;text-align:right;padding:5px 0;">${new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })}</td>
        </tr>
      </tbody></table>
    </td></tr></table>
  </td></tr>
  <!-- Items Table -->
  <tr><td style="padding:24px 48px 0;">
    <p style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;margin:0 0 10px;">🛒 Items Purchased</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
      <thead><tr style="background:#f8fafc;">
        <th style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-align:left;border-bottom:1px solid #e2e8f0;">Domain / Subject</th>
        <th style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-align:center;border-bottom:1px solid #e2e8f0;">Plan</th>
        <th style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-align:center;border-bottom:1px solid #e2e8f0;">Duration</th>
        <th style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-align:right;border-bottom:1px solid #e2e8f0;">Price</th>
      </tr></thead>
      <tbody>${itemsHtml}</tbody>
      <tfoot><tr style="background:#1e293b;">
        <td colspan="3" style="padding:12px 14px;font-size:12px;font-weight:700;color:#94a3b8;">Total (incl. 18% GST)</td>
        <td style="padding:12px 14px;font-size:15px;font-weight:900;color:#ffffff;text-align:right;">₹${totalAmount}</td>
      </tr></tfoot>
    </table>
  </td></tr>
  <!-- Access Info -->
  <tr><td style="padding:24px 48px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
    <tr><td style="padding:18px 22px;">
      <p style="color:#92400e;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">🔐 Access Your Subscription</p>
      <p style="color:#78350f;font-size:13px;margin:0 0 8px;">Log in to your dashboard to start reading:</p>
      <a href="https://journalslibrary.com/dashboard" style="display:inline-block;background:#1d4ed8;color:#fff;font-size:13px;font-weight:700;padding:10px 24px;border-radius:8px;text-decoration:none;">Go to My Dashboard →</a>
    </td></tr></table>
  </td></tr>
  <!-- Contact -->
  <tr><td style="padding:24px 48px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
    <tr><td style="padding:16px 22px;">
      <p style="color:#15803d;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">📞 Need Help?</p>
      <p style="margin:2px 0;font-size:13px;color:#1e293b;">📧 <a href="mailto:${COMPANY_DETAILS.email}" style="color:#2563eb;text-decoration:none;font-weight:600;">${COMPANY_DETAILS.email}</a></p>
      <p style="margin:2px 0;font-size:13px;color:#1e293b;">📞 +91-9810078958</p>
    </td></tr></table>
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a6e 100%);padding:24px 48px;text-align:center;">
    <p style="color:#f8fafc;font-size:12px;margin:0 0 4px;font-weight:700;">STM Digital Library — 21 Years of Trusted Excellence</p>
    <p style="color:#64748b;font-size:11px;margin:0;">© ${year} ${COMPANY_DETAILS.legalName}. All rights reserved.</p>
    <p style="color:#475569;font-size:10px;margin:4px 0 0;">GSTIN: ${COMPANY_DETAILS.gstin} &nbsp;|&nbsp; PAN: ${COMPANY_DETAILS.pan}</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

    // Admin notification HTML
    const adminHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
  <div style="background:#0f172a;padding:20px 28px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">🔔 New Payment Received</h2>
    <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">STM Digital Library — Admin Notification</p>
  </div>
  <div style="padding:24px 28px;border-bottom:1px solid #e2e8f0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="font-size:12px;color:#94a3b8;padding:4px 0;">Customer</td><td style="font-size:13px;font-weight:700;color:#1e293b;text-align:right;">${userName} &lt;${userEmail}&gt;</td></tr>
      <tr><td style="font-size:12px;color:#94a3b8;padding:4px 0;">Invoice No</td><td style="font-size:13px;font-weight:700;color:#1e293b;text-align:right;">${invoiceNumber}</td></tr>
      <tr><td style="font-size:12px;color:#94a3b8;padding:4px 0;">Payment ID</td><td style="font-size:12px;font-family:monospace;color:#1e293b;text-align:right;">${paymentId || '—'}</td></tr>
      <tr><td style="font-size:12px;color:#94a3b8;padding:4px 0;">Order ID</td><td style="font-size:12px;font-family:monospace;color:#1e293b;text-align:right;">${orderId || '—'}</td></tr>
      <tr><td style="font-size:12px;color:#94a3b8;padding:4px 0;">Amount</td><td style="font-size:18px;font-weight:900;color:#15803d;text-align:right;">₹${totalAmount}</td></tr>
      <tr><td style="font-size:12px;color:#94a3b8;padding:4px 0;">Date</td><td style="font-size:13px;font-weight:600;color:#1e293b;text-align:right;">${new Date().toLocaleString('en-IN')}</td></tr>
    </table>
  </div>
  <div style="padding:16px 28px;background:#f8fafc;">
    <p style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 8px;">Items</p>
    ${Array.isArray(items) ? items.map((item: any) => `<p style="margin:4px 0;font-size:13px;color:#1e293b;"><strong>${item.domainName || item.description}</strong> — ${item.planName || ''} | ${item.duration || 'Monthly'} | <strong>₹${Number(item.price || item.unitPrice || 0).toLocaleString('en-IN')}</strong></p>`).join('') : ''}
  </div>
  <div style="padding:16px 28px;text-align:center;">
    <a href="https://journalslibrary.com/admin/payments" style="display:inline-block;background:#1d4ed8;color:#fff;font-size:13px;font-weight:700;padding:10px 24px;border-radius:8px;text-decoration:none;">View in Admin Dashboard →</a>
  </div>
</div>
</body></html>`;

    try {
      // 1. Send to customer
      await sendMail({
        from: `"STM Digital Library" <${emailFrom}>`,
        to: userEmail,
        subject: `Payment Confirmation — Invoice ${invoiceNumber} | STM Digital Library`,
        html: customerHtml,
        attachments: pdfBase64 ? [{ filename: `Invoice_${invoiceNumber}.pdf`, content: pdfBase64, encoding: 'base64' }] : []
      });

      // 2. Send to admin
      await sendMail({
        from: `"STM Payments Alert" <${emailFrom}>`,
        to: adminEmail,
        subject: `[New Payment] ₹${totalAmount} from ${userName} — ${invoiceNumber}`,
        html: adminHtml
      });
      
      return true;
    } catch (err) {
      console.error("Payment Confirmation Emails Failed:", err);
      return false;
    }
  };

  // GET /api/admin/users — list users with optional role filter
  app.get("/api/admin/users", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { role: filterRole, search } = req.query;
      const where: any = {};
      if (filterRole && filterRole !== 'all') where.role = filterRole;
      if (search) {
        where.OR = [
          { email: { contains: search as string, mode: 'insensitive' } },
          { displayName: { contains: search as string, mode: 'insensitive' } }
        ];
      }
      const users = await prisma.user.findMany({
        where,
        include: {
          subscriptions: { where: { status: 'Active' }, take: 3 },
          payments: { orderBy: { createdAt: 'desc' }, take: 3 },
          institution: {
            include: {
              subscriptions: {
                where: { status: 'Active' },
                orderBy: { createdAt: 'desc' },
                take: 5
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      
      const verifications = await (prisma as any).emailVerification.findMany();
      const verifiedEmails = new Set(verifications.filter((v: any) => v.isVerified).map((v: any) => v.email));

      // Strip passwords and append verification status
      const sanitized = users.map(({ password: _, ...u }) => ({
        ...u,
        isEmailVerified: verifiedEmails.has(u.email)
      }));
      res.json(sanitized);
    } catch (err) {
      console.error('GET /api/admin/users error:', err);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // GET /api/admin/institutions — list institutions for the Student dropdown in UserCreationPanel
  app.get("/api/admin/institutions", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const institutions = await (prisma as any).institution.findMany({
        select: { id: true, name: true, status: true },
        orderBy: { name: 'asc' }
      });
      res.json(Array.isArray(institutions) ? institutions : []);
    } catch (err) {
      // Table may be empty — return empty array gracefully
      res.json([]);
    }
  });


  // POST /api/admin/users/create — create user + send email
  app.post("/api/admin/users/create", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { name, email, role, institutionId, institutionName, sendEmail, customPassword, isDemoAccount } = req.body;

      if (!name || !email || !role) {
        return res.status(400).json({ error: "Name, email and role are required" });
      }
      if (role === 'Institution' && !institutionName) {
        return res.status(400).json({ error: "Institution Name is required for Institution role" });
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return res.status(409).json({ error: "A user with this email already exists" });

      // Generate or use provided password
      const plainPassword = customPassword || generatePassword();
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      // Create new Institution object in DB if role is Institution
      let newInstId = null;
      if (role === 'Institution') {
         const newInst = await (prisma as any).institution.create({
            data: {
               name: institutionName,
               status: 'Active'
            }
         });
         newInstId = newInst.id;
      }

      const newUser = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          displayName: name,
          role,
          status: 'Active',
          isFirstLogin: true,
          organization: institutionName || undefined,
          institutionId: newInstId || institutionId || undefined,
          isDemoAccount: Boolean(isDemoAccount),
          demoExpiresAt: isDemoAccount ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null
        }
      });


      // Log the creation action
      await prisma.usageLog.create({
        data: {
          action: 'USER_CREATED',
          details: `User ${email} created with role ${role} by ${req.user.email}`,
          userId: req.user.uid
        }
      });

      // Email credentials if requested (default: true)
      if (sendEmail !== false) {
        await sendCredentialsEmail(email, name, plainPassword);
      }

      const { password: _, ...profile } = newUser;
      res.json({
        user: profile,
        credentials: { email, password: plainPassword } // returned once for admin to copy
      });
    } catch (err) {
      console.error("Create user error:", err);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  // PUT /api/admin/users/:id — full update (name, email, role, organization)
  app.put("/api/admin/users/:id", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { displayName, email, role, organization, contact, designation, branch, department } = req.body;

      if (role === 'SuperAdmin' && req.user.role !== 'SuperAdmin') {
        return res.status(403).json({ error: "Only SuperAdmins can assign the SuperAdmin role" });
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "User not found" });

      // Check email uniqueness if changing
      if (email && email !== existing.email) {
        const taken = await prisma.user.findUnique({ where: { email } });
        if (taken) return res.status(409).json({ error: "Email already in use" });
      }

      let newInstitutionProfile = (existing.institutionProfile as any) || {};
      if (branch !== undefined) newInstitutionProfile.branch = branch;
      if (department !== undefined) newInstitutionProfile.department = department;

      const updated = await prisma.user.update({
        where: { id },
        data: {
          ...(displayName ? { displayName } : {}),
          ...(email ? { email } : {}),
          ...(role ? { role } : {}),
          ...(organization !== undefined ? { organization } : {}),
          ...(contact !== undefined ? { contact } : {}),
          ...(designation !== undefined ? { designation } : {}),
          institutionProfile: newInstitutionProfile
        }
      });
      const { password: _, ...profile } = updated;
      res.json({ user: profile });
    } catch (err) {
      console.error('PUT /api/admin/users/:id error:', err);
      res.status(500).json({ error: "Failed to update user" });
    }
  });


  app.put("/api/admin/users/:id/role", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { role } = req.body;
      const { id } = req.params;

      const allowedRoles = ['SuperAdmin', 'SubscriptionManager', 'Institution', 'Student', 'Subscriber'];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role value" });
      }

      // Only SuperAdmin can create another SuperAdmin
      if (role === 'SuperAdmin' && req.user.role !== 'SuperAdmin') {
        return res.status(403).json({ error: "Only SuperAdmins can assign the SuperAdmin role" });
      }

      const prevUser = await prisma.user.findUnique({ where: { id } });
      if (!prevUser) return res.status(404).json({ error: "User not found" });

      const updated = await prisma.user.update({ where: { id }, data: { role } });

      // Audit log
      await prisma.usageLog.create({
        data: {
          action: 'ROLE_CHANGE',
          details: `Role changed from ${prevUser.role} → ${role} for user ${prevUser.email} by ${req.user.email}`,
          userId: req.user.uid
        }
      });

      const { password: _, ...profile } = updated;
      res.json({ user: profile });
    } catch (err) {
      res.status(500).json({ error: "Failed to update role" });
    }
  });

  // POST /api/admin/users/:id/reset-password — generate + email new password
  app.post("/api/admin/users/:id/reset-password", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { id } = req.params;
      const targetUser = await prisma.user.findUnique({ where: { id } });
      if (!targetUser) return res.status(404).json({ error: "User not found" });

      const newPlain = generatePassword();
      const hashed = await bcrypt.hash(newPlain, 10);

      await prisma.user.update({
        where: { id },
        data: { password: hashed, isFirstLogin: true }
      });

      await sendCredentialsEmail(targetUser.email, targetUser.displayName || 'User', newPlain);

      await prisma.usageLog.create({
        data: {
          action: 'PASSWORD_RESET',
          details: `Password reset for ${targetUser.email} by ${req.user.email}`,
          userId: req.user.uid
        }
      });

      res.json({ message: "Password reset and emailed successfully", password: newPlain });
    } catch (err) {
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // DELETE user (SuperAdmin only)
  app.delete("/api/admin/users/:id", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      if (id === req.user.uid) return res.status(400).json({ error: "Cannot delete your own account" });
      
      // Delete user and all related records to avoid foreign key constraints
      await prisma.$transaction([
        (prisma as any).payment.deleteMany({ where: { userId: id } }),
        (prisma as any).subscription.deleteMany({ where: { userId: id } }),
        (prisma as any).subscriptionRequest.deleteMany({ where: { userId: id } }),
        (prisma as any).quotation.deleteMany({ where: { userId: id } }),
        (prisma as any).submission.deleteMany({ where: { userId: id } }),
        (prisma as any).usageLog.deleteMany({ where: { userId: id } }),
        (prisma as any).studentActivity.deleteMany({ where: { userId: id } }),
        (prisma as any).couponUsage.deleteMany({ where: { userId: id } }),
        (prisma as any).favorite.deleteMany({ where: { userId: id } }),
        prisma.user.delete({ where: { id } })
      ]);
      
      res.json({ message: "User deleted" });
    } catch (err) {
      console.error("Delete user error:", err);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });


  // ========================

  const GST_RATE = 0.18;
  const COMPANY_STATE = "Delhi";

  const USER_TYPES = [
    'General',
    'Student Scholar',
    'College Excellence',
    'University Global',
    'Corporate Innovator'
  ];

  // Helper: upsert content module counts from DB (per userType)
  async function syncContentModuleCounts() {
    const groups = await prisma.content.groupBy({
      by: ['domain', 'contentType'],
      where: { status: { in: ['Published', 'published'] }, domain: { not: null } },
      _count: { id: true }
    });
    for (const g of groups) {
      if (!g.domain) continue;
      for (const userType of USER_TYPES) {
        await (prisma as any).contentModule.upsert({
          where: { domain_contentType_userType: { domain: g.domain, contentType: g.contentType, userType } },
          create: { domain: g.domain, contentType: g.contentType, userType, totalCount: g._count.id },
          update: { totalCount: g._count.id }
        });
      }
    }
  }

  // GET /api/content-modules — public list, optionally filtered by domain and/or userType
  app.get("/api/content-modules", async (req, res) => {
    try {
      const { domain, userType } = req.query;
      const where: any = { isActive: true };
      if (domain) where.domain = domain;
      // Default to 'General' if no userType provided
      where.userType = userType ? userType : 'General';
      const modules = await (prisma as any).contentModule.findMany({
        where,
        orderBy: [{ domain: 'asc' }, { contentType: 'asc' }]
      });
      res.json(modules);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch content modules" });
    }
  });

  // POST /api/content-modules/calculate — public price calculator
  app.post("/api/content-modules/calculate", async (req, res) => {
    try {
      const { moduleIds, planType, userState, userType } = req.body;
      if (!Array.isArray(moduleIds) || moduleIds.length === 0) {
        return res.json({ subtotal: 0, gstAmount: 0, total: 0, breakdown: [], planType });
      }

      const modules = await (prisma as any).contentModule.findMany({
        where: { id: { in: moduleIds }, isActive: true }
      });

      const breakdown = modules.map((m: any) => {
        let price = 0;
        if (planType === 'Monthly') price = m.monthlyPrice;
        else if (planType === 'Quarterly') price = m.quarterlyPrice;
        else if (planType === 'Half-Yearly') price = m.halfYearlyPrice;
        else if (planType === 'Yearly') price = m.yearlyPrice;
        return {
          id: m.id, domain: m.domain, contentType: m.contentType,
          price, totalCount: m.totalCount, planType,
          userType: m.userType
        };
      });

      const subtotal = breakdown.reduce((sum: number, b: any) => sum + b.price, 0);
      const isInterState = userState && userState.toLowerCase() !== COMPANY_STATE.toLowerCase();
      const gstAmount = parseFloat((subtotal * GST_RATE).toFixed(2));
      const total = parseFloat((subtotal + gstAmount).toFixed(2));

      res.json({
        breakdown, subtotal, gstAmount, total, planType, userType,
        gstType: isInterState ? 'IGST' : 'CGST+SGST',
        gstRate: GST_RATE
      });
    } catch (error) {
      console.error("Calculate error:", error);
      res.status(500).json({ error: "Calculation failed" });
    }
  });

  // =================================
  // ADMIN: Content Module Pricing CRUD
  // =================================

  app.get("/api/admin/content-modules", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      await syncContentModuleCounts();
      const { userType } = req.query;
      const where: any = {};
      if (userType && userType !== 'all') where.userType = userType;
      const modules = await (prisma as any).contentModule.findMany({
        where,
        orderBy: [{ domain: 'asc' }, { userType: 'asc' }, { contentType: 'asc' }]
      });
      res.json(modules);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch modules" });
    }
  });

  app.put("/api/admin/content-modules/:id", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { monthlyPrice, quarterlyPrice, halfYearlyPrice, yearlyPrice, yearlyDiscountPct, isActive, userType } = req.body;
      const data: any = {};
      if (monthlyPrice !== undefined) data.monthlyPrice = parseFloat(monthlyPrice);
      if (quarterlyPrice !== undefined) data.quarterlyPrice = parseFloat(quarterlyPrice);
      if (halfYearlyPrice !== undefined) data.halfYearlyPrice = parseFloat(halfYearlyPrice);
      if (yearlyPrice !== undefined) data.yearlyPrice = parseFloat(yearlyPrice);
      if (yearlyDiscountPct !== undefined) data.yearlyDiscountPct = parseFloat(yearlyDiscountPct);
      if (isActive !== undefined) data.isActive = isActive;
      if (userType !== undefined) data.userType = userType;
      const updated = await (prisma as any).contentModule.update({ where: { id }, data });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update module" });
    }
  });

  app.post("/api/admin/content-modules/sync", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      await syncContentModuleCounts();
      const modules = await (prisma as any).contentModule.findMany({ orderBy: [{ domain: 'asc' }, { contentType: 'asc' }] });
      res.json({ synced: modules.length, modules });
    } catch (error) {
      res.status(500).json({ error: "Sync failed" });
    }
  });

  // ========================
  // VIDEO DISPLAY SYSTEM
  // ========================

  app.get("/api/videos/grouped", authenticateJWT, async (req: any, res) => {
    try {
      const activeSubs = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);
      
      const videos = await prisma.content.findMany({
        where: { 
          contentType: "Educational Videos", 
          status: { in: ["Published", "published"] } 
        }
      });

      // Filter by access (reusing existing checkContentAccess logic)
      const accessibleVideos = videos.filter(v => checkContentAccess(v as any, req.user.role, activeSubs));

      // Group by domain
      const grouped = accessibleVideos.reduce((acc: any, video: any) => {
        const d = video.domain || "Other";
        if (!acc[d]) acc[d] = [];
        acc[d].push(video);
        return acc;
      }, {});

      res.json(grouped);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch grouped videos" });
    }
  });

  app.get("/api/videos/:id/details", authenticateJWT, async (req: any, res) => {
    try {
      const videoId = req.params.id;
      const content = await prisma.content.findUnique({ where: { id: videoId } });
      
      if (!content || content.contentType !== "Educational Videos") {
        return res.status(404).json({ error: "Video not found" });
      }

      const activeSubs = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);
      if (!checkContentAccess(content, req.user.role, activeSubs)) {
        return res.status(403).json({ error: "Access denied." });
      }

      // Log activity (safe findFirst+update/create — avoids duplicate-row race conditions)
      if (['Student', 'Subscriber'].includes(req.user.role)) {
        try {
          const existing = await prisma.studentActivity.findFirst({
            where: { userId: req.user.uid, contentId: content.id }
          });
          if (existing) {
            await prisma.studentActivity.update({ where: { id: existing.id }, data: { accessedAt: new Date() } });
          } else {
            await prisma.studentActivity.create({ data: { userId: req.user.uid, contentId: content.id, timeSpent: 0, lastPage: 1 } });
          }
        } catch(e) { console.error('Activity log failed (video):', e); }
      }

      // Find related videos (same domain, max 10, accessible)
      let related: any[] = [];
      if (content.domain) {
        const allRelated = await prisma.content.findMany({
          where: { 
            contentType: "Educational Videos", 
            domain: content.domain, 
            status: { in: ["Published", "published"] },
            id: { not: content.id }
          },
          take: 20
        });
        related = allRelated.filter(v => checkContentAccess(v as any, req.user.role, activeSubs)).slice(0, 10);
      }

      res.json({
        video: {
          id: content.id,
          title: content.title,
          description: content.description,
          domain: content.domain,
          fileUrl: content.fileUrl
        },
        related
      });
      
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch video details" });
    }
  });

  // ========================
  // PUBLIC: Global Search
  // ========================

  // GET /api/search?q=keyword&domain=X&contentType=Y&page=1&limit=20
  app.get("/api/search", async (req, res) => {
    try {
      const { q, domain, contentType, page = "1", limit = "20" } = req.query as Record<string, string>;
      if (!q || q.trim().length < 2) {
        return res.json({ data: [], total: 0, query: q || "" });
      }
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const where: any = {
        status: "Published",
        OR: [
          { title:       { contains: q, mode: "insensitive" } },
          { authors:     { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { domain:      { contains: q, mode: "insensitive" } },
          { contentType: { contains: q, mode: "insensitive" } },
          { subjectArea: { contains: q, mode: "insensitive" } },
        ],
      };
      if (domain)      where.domain      = domain;
      if (contentType) where.contentType = contentType;

      const [data, total] = await Promise.all([
        prisma.content.findMany({
          where,
          skip,
          take: parseInt(limit),
          orderBy: { publishedAt: "desc" },
          select: {
            id: true, title: true, authors: true, domain: true,
            contentType: true, description: true, subjectArea: true,
            thumbnailUrl: true, accessType: true, price: true,
            publishedAt: true,
          },
        }),
        prisma.content.count({ where }),
      ]);
      res.json({ data, total, query: q, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
      console.error("GET /api/search error:", err);
      res.status(500).json({ error: "Search failed" });
    }
  });

  // ========================
  // PUBLIC: Domain Data API
  // ========================

  // GET /api/domain-data?domain=X — content summary + pricing modules for a domain
  app.get("/api/domain-data", async (req, res) => {
    try {
      const domain = req.query.domain as string;
      if (!domain) return res.status(400).json({ error: "domain query param required" });

      // 1. Content summary — count published content per type for this domain
      const contentGroups = await prisma.content.groupBy({
        by: ['contentType'],
        where: { domain, status: { in: ['Published', 'published'] } },
        _count: { id: true },
        orderBy: { contentType: 'asc' }
      });
      const content_summary = contentGroups.map((g: any) => ({
        type: g.contentType,
        count: g._count.id
      }));

      // 2. Pricing modules — active modules for this domain, optionally filtered by userType
      const { userType } = req.query as { userType?: string };
      const moduleWhere: any = { domain, isActive: true };
      if (userType) moduleWhere.userType = userType;
      else moduleWhere.userType = 'General';

      const modules = await (prisma as any).contentModule.findMany({
        where: moduleWhere,
        orderBy: { contentType: 'asc' }
      });
      const pricing_modules = modules.map((m: any) => ({
        id: m.id,
        type: m.contentType,
        userType: m.userType,
        monthlyPrice: m.monthlyPrice,
        quarterlyPrice: m.quarterlyPrice,
        halfYearlyPrice: m.halfYearlyPrice,
        yearlyPrice: m.yearlyPrice,
        yearlyDiscountPct: m.yearlyDiscountPct,
        totalCount: m.totalCount,
        visible: m.isActive
      }));

      res.json({ domain, content_summary, pricing_modules, userTypes: USER_TYPES });
    } catch (err) {
      console.error("GET /api/domain-data error:", err);
      res.status(500).json({ error: "Failed to fetch domain data" });
    }
  });

  // POST /api/domain-request — public request access form from domain landing page
  app.post("/api/domain-request", async (req, res) => {
    try {
      const { userName, email, organization, domain, selectedModules, planType, totalPrice, notes } = req.body;
      if (!userName || !email || !domain) {
        return res.status(400).json({ error: "Name, email and domain are required" });
      }

      const planDesc = `Domain Access Request: ${domain} | Plan: ${planType || 'Monthly'} | Modules: ${
        Array.isArray(selectedModules) ? selectedModules.join(', ') : 'All'
      } | Est. Total: ₹${totalPrice || 0}${organization ? ` | Org: ${organization}` : ''}`;

      const request = await prisma.subscriptionRequest.create({
        data: {
          userName,
          email,
          planType: planType || 'Monthly',
          durationMonths: planType === 'Yearly' ? 12 : planType === 'Quarterly' ? 3 : 1,
          planDescription: planDesc,
          notes: notes || null,
          status: 'Pending'
        }
      });

      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      const durationMonths = planType === 'Yearly' ? 12 : planType === 'Quarterly' ? 3 : 1;
      const adminMailOptions = {
        from: `"STM Digital Library" <${emailFrom}>`,
        to: process.env.ADMIN_EMAIL || COMPANY_DETAILS.email,
        subject: `🔥 New Domain Access Lead: ${domain} — ${userName}`,
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;">`+
          `<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">🔥 New Domain Access Lead</p>`+
          `<p style="margin:0 0 20px;font-size:13px;color:#475569;">A new access request has been submitted for the <strong>${domain}</strong> collection.</p>`+
          `<table width="100%" cellpadding="0" cellspacing="0" style="background:#1e3a6e;border-radius:10px;margin-bottom:20px;"><tr><td style="padding:18px 20px;">`+
          `<p style="color:#bfdbfe;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">📦 Request Details</p>`+
          `<p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Domain:</span> <strong style="color:#fff;">${domain}</strong></p>`+
          `<p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Notes:</span> <span style="color:#e2e8f0;">${notes||'—'}</span></p>`+
          `</td></tr></table>`+
          `<table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:18px;">`+
          `<tr style="background:#f8fafc;"><td style="padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;" colspan="2">Contact Info</td></tr>`+
          `<tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;width:35%;border-bottom:1px solid #f1f5f9;">Name</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9;">${userName}</td></tr>`+
          `<tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Email</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e3a6e;border-bottom:1px solid #f1f5f9;">${email}</td></tr>`+
          `<tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;">Organization</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;">${organization||'N/A'}</td></tr>`+
          `</table>`+
          `<div style="background:#fefce8;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:12px 16px;">`+
          `<p style="margin:0;font-size:13px;color:#92400e;">🏃 <strong>Hot Lead!</strong> Follow up within 24 hours.</p></div>`+
          `</td></tr>`
        )
      };

      const userMailOptions = {
        from: `"STM Digital Library" <${emailFrom}>`,
        to: email,
        subject: `✅ Your Request for ${domain} Access — Received!`,
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;">`+
          `<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">✅ Request Received!</p>`+
          `<p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.7;">Dear <strong>${userName}</strong>, we have received your request for the <strong>${domain}</strong> collection. Our team will contact you shortly to finalize the setup.</p>`+
          `<table width="100%" cellpadding="0" cellspacing="0" style="background:#1e3a6e;border-radius:10px;margin-bottom:20px;"><tr><td style="padding:18px 20px;">`+
          `<p style="color:#bfdbfe;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">📋 Your Request Summary</p>`+
          `<p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Domain:</span> <strong style="color:#fff;">${domain}</strong></p>`+
          `<p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Organization:</span> <span style="color:#e2e8f0;">${organization||'—'}</span></p>`+
          `<p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Notes:</span> <span style="color:#e2e8f0;">${notes||'—'}</span></p>`+
          `</td></tr></table>`+
          `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;margin-bottom:18px;"><tr><td style="padding:18px 20px;">`+
          `<p style="color:#15803d;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">🕐 What Happens Next?</p>`+
          `<p style="margin:5px 0;font-size:13px;color:#1e293b;"><span style="background:#15803d;color:#fff;font-size:10px;font-weight:700;border-radius:50%;padding:2px 6px;">1</span>&nbsp; Our team reviews your request within 24 hrs</p>`+
          `<p style="margin:5px 0;font-size:13px;color:#1e293b;"><span style="background:#15803d;color:#fff;font-size:10px;font-weight:700;border-radius:50%;padding:2px 6px;">2</span>&nbsp; We confirm subscription &amp; payment details</p>`+
          `<p style="margin:5px 0;font-size:13px;color:#1e293b;"><span style="background:#15803d;color:#fff;font-size:10px;font-weight:700;border-radius:50%;padding:2px 6px;">3</span>&nbsp; Full-text access is activated instantly</p>`+
          `</td></tr></table>`+
          `<p style="font-size:12px;color:#64748b;margin:0;">Questions? Email <a href="mailto:${COMPANY_DETAILS.email}" style="color:#1e3a6e;font-weight:600;">${COMPANY_DETAILS.email}</a> or call <strong>+91-120-4781200</strong></p>`+
          `</td></tr>`
        )
      };

      await sendMail(adminMailOptions);
      await sendMail(userMailOptions);

      res.json({ success: true, requestId: request.id, message: "Your request has been received. We will contact you shortly." });
    } catch (err) {
      console.error("POST /api/domain-request error:", err);
      res.status(500).json({ error: "Failed to submit request" });
    }
  });

  // ========================
  // Generate next sequential quotation number
  app.get("/api/quotation/next-number", authenticateJWT, requireSalesRole, async (_req: any, res: any) => {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const prefix = `QTN-${year}-${month}-`;
      // Count existing quotations with this month prefix
      const count = await (prisma as any).quotation.count({
        where: { id: { startsWith: prefix } }
      });
      const seq = String(count + 1).padStart(2, '0');
      res.json({ quotationNumber: `${prefix}${seq}` });
    } catch (error) {
      console.error("Next quotation number error:", error);
      res.status(500).json({ error: "Failed to generate quotation number" });
    }
  });

  // PUBLIC + AUTH: Quotations
  // ========================

  app.post("/api/quotations", authenticateJWT, async (req: any, res) => {
    try {
      const {
        userName, userEmail, organization, state, planType,
        moduleIds, pricingBreakdown, subtotal, gstAmount, total,
        items, allowedDomain, notes
      } = req.body;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const quotation = await (prisma as any).quotation.create({
        data: {
          issuer: currentIssuer(),
          userName, userEmail, organization, state,
          planType: planType || 'Monthly',
          selectedModules: moduleIds || [],
          pricingBreakdown: pricingBreakdown || {},
          items: items || [],
          subtotal: parseFloat(subtotal) || 0,
          gstAmount: parseFloat(gstAmount) || 0,
          total: parseFloat(total) || 0,
          allowedDomain: allowedDomain || null,
          notes: notes || null,
          userId: req.user?.uid || req.user?.id || null,
          expiresAt
        }
      });
      res.json(quotation);
    } catch (error: any) {
      console.error("Create quotation error:", error);
      res.status(500).json({ error: "Failed to create quotation" });
    }
  });

  app.get("/api/admin/quotations", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { status } = req.query;
      const where: any = {};
      if (status) where.status = status;
      const quotations = await (prisma as any).quotation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { user: true }
      });
      res.json(quotations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch quotations" });
    }
  });

  app.put("/api/admin/quotations/:id", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, notes, paymentMethod } = req.body;
      const data: any = {};
      if (status) data.status = status;
      if (notes !== undefined) data.notes = notes;
      const updated = await (prisma as any).quotation.update({ where: { id }, data });

      // Marking a quotation Paid is a statement that money arrived, so it belongs
      // in the payments ledger even when no receipt has been issued yet.
      if (status === 'Paid') {
        await recordQuotationPayment(updated, { method: paymentMethod });
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update quotation" });
    }
  });

  app.post("/api/admin/quotations/:id/convert", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.body;
      const quotation = await (prisma as any).quotation.findUnique({ where: { id } });
      if (!quotation) return res.status(404).json({ error: "Quotation not found" });
      if (!quotation.userId) return res.status(400).json({ error: "Quotation has no linked user; assign manually" });

      const breakdown = (quotation.pricingBreakdown as any) || {};
      const allowedTypes = Array.isArray(breakdown.breakdown)
        ? breakdown.breakdown.map((b: any) => b.contentType)
        : [];

      const start = startDate ? new Date(startDate) : new Date();
      const end = endDate ? new Date(endDate) : (() => {
        const d = new Date(start);
        const months = quotation.planType === 'Yearly' ? 12 : quotation.planType === 'Quarterly' ? 3 : 1;
        d.setMonth(d.getMonth() + months);
        return d;
      })();

      const sub = await (prisma as any).subscription.create({
        data: {
          userId: quotation.userId,
          planName: `Custom Package (${quotation.planType})`,
          planType: quotation.planType || 'Monthly',
          domainName: quotation.allowedDomain || 'All Domains',
          startDate: start, endDate: end, status: 'Active'
        }
      });

      await (prisma as any).quotation.update({ where: { id }, data: { status: 'Paid' } });
      res.json({ subscription: sub, quotation: { ...quotation, status: 'Paid' } });
    } catch (error: any) {
      console.error("Convert quotation error:", error);
      res.status(500).json({ error: "Conversion failed" });
    }
  });

  // ==========================================
  // RECEIPTS (Payment received -> receipt)
  // ==========================================

  // Generate the next sequential receipt number (RCP-YYYY-MM-NN)
  const generateReceiptNumber = async () => {
    const now = new Date();
    const prefix = `RCP-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-`;
    const count = await (prisma as any).receipt.count({ where: { receiptNumber: { startsWith: prefix } } });
    return `${prefix}${String(count + 1).padStart(2, '0')}`;
  };

  /**
   * Record money received against a quotation.
   *
   * Payment rows used to be created only by the Razorpay verify webhook, so
   * anything collected offline (bank transfer, cheque, UPI) never appeared in
   * /admin/payments at all. Both "mark as paid" paths now come through here.
   *
   * Idempotent: orderId is the quotation id and is unique, so re-marking a
   * quotation paid updates the existing row instead of creating a duplicate.
   */
  const recordQuotationPayment = async (
    quotation: any,
    opts: { method?: string; receiptNumber?: string | null; paidAt?: Date } = {}
  ) => {
    try {
      const data = {
        amount: quotation.total,
        status: 'Success',
        method: opts.method || 'Bank Transfer',
        userId: quotation.userId || null,
        items: quotation.items || [],
        paymentId: opts.receiptNumber || null,
      };
      return await (prisma as any).payment.upsert({
        where:  { orderId: quotation.id },
        update: data,
        create: { orderId: quotation.id, ...data, createdAt: opts.paidAt || new Date() },
      });
    } catch (e) {
      // Never fail the caller over bookkeeping — the receipt/status is the record of truth.
      console.error('[payments] failed to record payment for quotation', quotation?.id, e);
      return null;
    }
  };

  // Mark a quotation as paid and create a receipt (immutable snapshot of the quotation)
  app.post("/api/admin/quotations/:id/receipt", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { paymentMethod, paymentRef, paymentDate } = req.body || {};

      const quotation = await (prisma as any).quotation.findUnique({ where: { id } });
      if (!quotation) return res.status(404).json({ error: "Quotation not found" });

      // Prevent duplicate receipts for the same quotation
      const existing = await (prisma as any).receipt.findFirst({ where: { quotationId: id } });
      if (existing) return res.status(409).json({ error: "A receipt already exists for this quotation", receipt: existing });

      const receiptNumber = await generateReceiptNumber();

      const receipt = await (prisma as any).receipt.create({
        data: {
          issuer: currentIssuer(),
          receiptNumber,
          quotationId: quotation.id,
          userId: quotation.userId || null,
          userEmail: quotation.userEmail,
          userName: quotation.userName,
          organization: quotation.organization || null,
          state: quotation.state || null,
          address: quotation.address || null,
          pincode: quotation.pincode || null,
          gstNumber: quotation.gstNumber || null,
          mobile: quotation.mobile || null,
          userCategory: quotation.userCategory || null,
          items: quotation.items || [],
          subtotal: quotation.subtotal,
          gstAmount: quotation.gstAmount,
          total: quotation.total,
          discountAmount: quotation.discountAmount || 0,
          couponCode: quotation.couponCode || null,
          planType: quotation.planType || 'Monthly',
          allowedDomain: quotation.allowedDomain || null,
          paymentMethod: paymentMethod || 'Bank Transfer',
          paymentRef: paymentRef || null,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          createdBy: req.user?.email || req.user?.uid || 'Admin',
        }
      });

      // Reflect payment on the source quotation
      await (prisma as any).quotation.update({ where: { id }, data: { status: 'Paid' } });

      // ...and in the payments ledger, so /admin/payments shows offline payments too
      await recordQuotationPayment(quotation, {
        method: receipt.paymentMethod,
        receiptNumber: receipt.receiptNumber,
        paidAt: receipt.paymentDate,
      });

      res.json(receipt);
    } catch (error: any) {
      console.error("Create receipt error:", error);
      res.status(500).json({ error: "Failed to create receipt" });
    }
  });

  // List all receipts (newest first, optional search)
  app.get("/api/admin/receipts", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { search } = req.query;
      const where: any = {};
      if (search) {
        where.OR = [
          { receiptNumber: { contains: search as string, mode: 'insensitive' } },
          { userName: { contains: search as string, mode: 'insensitive' } },
          { userEmail: { contains: search as string, mode: 'insensitive' } },
          { organization: { contains: search as string, mode: 'insensitive' } },
        ];
      }
      const receipts = await (prisma as any).receipt.findMany({ where, orderBy: { createdAt: 'desc' } });
      res.json(receipts);
    } catch (error: any) {
      console.error("List receipts error:", error);
      res.status(500).json({ error: "Failed to fetch receipts" });
    }
  });

  // Get one receipt
  app.get("/api/admin/receipts/:id", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const receipt = await (prisma as any).receipt.findUnique({ where: { id: req.params.id } });
      if (!receipt) return res.status(404).json({ error: "Receipt not found" });
      res.json(receipt);
    } catch (error: any) {
      console.error("Get receipt error:", error);
      res.status(500).json({ error: "Failed to fetch receipt" });
    }
  });

  // Email a receipt PDF (generated client-side, sent as base64) to the customer
  app.post("/api/admin/receipts/:id/send", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { pdfBase64 } = req.body || {};
      if (!pdfBase64) return res.status(400).json({ error: "Missing receipt PDF" });

      const receipt = await (prisma as any).receipt.findUnique({ where: { id } });
      if (!receipt) return res.status(404).json({ error: "Receipt not found" });

      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || COMPANY_DETAILS.email).trim();
      const logoPath = path.join(process.cwd(), 'public', 'assets', 'stm-logo.png');
      const logoExists = fs.existsSync(logoPath);

      const paidOn = new Date(receipt.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const totalAmount = Number(receipt.total).toLocaleString('en-IN', { minimumFractionDigits: 2 });

      const htmlBody = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Payment Receipt — STM Digital Library</title></head>
<body style="margin:0;padding:0;background-color:#eef2f7;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef2f7;padding:32px 0;"><tr><td align="center">
    <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);max-width:620px;">
      <tr><td style="background:linear-gradient(135deg,#065f46 0%,#047857 100%);padding:32px 48px 28px;text-align:center;">
        ${logoExists ? `<img src="cid:stm-logo" alt="STM Digital Library" width="96" height="96" style="display:block;margin:0 auto 14px;border-radius:12px;"/>` : ''}
        <h1 style="color:#ffffff;margin:0 0 6px;font-size:24px;font-weight:900;letter-spacing:1px;">PAYMENT RECEIPT</h1>
        <p style="color:#a7f3d0;margin:0;font-size:13px;font-weight:500;">${COMPANY_DETAILS.name} — ${COMPANY_DETAILS.legalName}</p>
      </td></tr>
      <tr><td style="padding:32px 48px 8px;">
        <p style="font-size:16px;color:#1e293b;margin:0 0 6px;font-weight:600;">Dear ${receipt.userName},</p>
        <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 20px;">
          We gratefully acknowledge the receipt of your payment. Please find your official receipt attached for your records.
        </p>
      </td></tr>
      <tr><td style="padding:0 48px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#047857,#065f46);border-radius:14px;">
          <tr><td style="padding:22px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="color:#a7f3d0;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.15);width:55%;">Receipt Number</td>
                  <td style="color:#ffffff;font-size:13px;font-weight:700;text-align:right;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.15);">${receipt.receiptNumber}</td></tr>
              <tr><td style="color:#a7f3d0;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.15);">Payment Date</td>
                  <td style="color:#ffffff;font-size:13px;font-weight:600;text-align:right;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.15);">${paidOn}</td></tr>
              <tr><td style="color:#a7f3d0;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.15);">Payment Method</td>
                  <td style="color:#ffffff;font-size:13px;font-weight:600;text-align:right;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.15);">${receipt.paymentMethod}${receipt.paymentRef ? ` (${receipt.paymentRef})` : ''}</td></tr>
              <tr><td style="color:#a7f3d0;font-size:13px;font-weight:600;padding-top:14px;">Amount Paid (Incl. 18% GST)</td>
                  <td style="text-align:right;padding-top:14px;"><span style="color:#ffffff;font-size:22px;font-weight:900;">₹${totalAmount}</span></td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 48px 36px;">
        <p style="font-size:13px;color:#64748b;line-height:1.7;margin:0;">This is a computer-generated receipt. For any queries, contact us at ${process.env.ADMIN_EMAIL || COMPANY_DETAILS.email}.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

      const attachments: any[] = [
        { filename: `Receipt_${receipt.receiptNumber}.pdf`, content: pdfBase64, encoding: 'base64' }
      ];
      if (logoExists) attachments.push({ filename: 'stm-logo.png', path: logoPath, cid: 'stm-logo' });

      await sendMail({
        from: `"STM Digital Library" <${emailFrom}>`,
        to: [receipt.userEmail, process.env.ADMIN_EMAIL || COMPANY_DETAILS.email],
        subject: `Payment Receipt ${receipt.receiptNumber} — STM Digital Library`,
        html: htmlBody,
        attachments
      });

      const updated = await (prisma as any).receipt.update({ where: { id }, data: { emailSentAt: new Date() } });
      res.json({ status: "success", receipt: updated });
    } catch (error: any) {
      console.error("Send receipt error:", error);
      if (!res.headersSent) res.status(500).json({ error: "Failed to send receipt" });
    }
  });

  // ==========================================
  // PUBLISHER MODULE (Phase 3) — additive, uses new Publisher/Article/Book models
  // ==========================================

  function mapArticleInput(b: any, publisher: any, status: string, createdBy: string, ownershipSource = 'PublisherSubmitted') {
    return {
      title: b.title || 'Untitled',
      authors: b.authors || null,
      abstract: b.abstract || null,
      doi: b.doi || null,
      pdfUrl: b.pdfUrl || null,
      journalName: b.journalName || null,
      journalIssn: b.journalIssn || b.issn || null,
      publisherId: publisher.id,
      publisherName: publisher.name,
      volume: b.volume ? String(b.volume) : null,
      issue: b.issue ? String(b.issue) : null,
      year: b.year ? parseInt(b.year) : null,
      pages: b.pages || null,
      domain: b.domain || null,
      subject: b.subject || null,
      language: b.language || null,
      country: b.country || publisher.country || null,
      accessType: b.accessType || 'OpenAccess',
      status,
      source: b.source || 'Manual',
      ownershipSource,
      uploadId: b.uploadId || null,
      createdBy,
    };
  }
  function mapBookInput(b: any, publisher: any, status: string, createdBy: string, ownershipSource = 'PublisherSubmitted') {
    return {
      title: b.title || 'Untitled',
      authors: b.authors || null,
      publisherId: publisher.id,
      publisherName: publisher.name,
      isbn: b.isbn || null,
      doi: b.doi || null,
      year: b.year ? parseInt(b.year) : null,
      subject: b.subject || null,
      domain: b.domain || null,
      language: b.language || null,
      country: b.country || publisher.country || null,
      description: b.description || null,
      coverUrl: b.coverUrl || null,
      pdfUrl: b.pdfUrl || null,
      accessType: b.accessType || 'OpenAccess',
      status,
      source: b.source || 'Manual',
      ownershipSource,
      uploadId: b.uploadId || null,
      createdBy,
    };
  }

  // facing=true → publisher-facing counts: NEVER count pre-scraped (Ingested) rows.
  const getPublisherCounts = async (publisherId: string, facing = false) => {
    const base: any = { publisherId };
    if (facing) base.ownershipSource = { not: 'Ingested' };
    const [articles, books, articlesPublished, articlesPending, articlesRejected, artReads, bookReads] = await Promise.all([
      (prisma as any).article.count({ where: { ...base } }),
      (prisma as any).book.count({ where: { ...base } }),
      (prisma as any).article.count({ where: { ...base, status: 'Published' } }),
      (prisma as any).article.count({ where: { ...base, status: 'Draft' } }),
      (prisma as any).article.count({ where: { ...base, status: 'Rejected' } }),
      (prisma as any).article.aggregate({ where: { ...base }, _sum: { views: true } }),
      (prisma as any).book.aggregate({ where: { ...base }, _sum: { views: true } }),
    ]);
    const totalReads = (artReads._sum.views || 0) + (bookReads._sum.views || 0);
    return { articles, books, articlesPublished, articlesPending, articlesRejected, totalReads };
  };

  // Batched counterpart of getPublisherCounts, for endpoints that need counts for
  // EVERY publisher. The per-publisher version costs 7 queries; running it in a
  // Promise.all over ~145 publishers fired ~1k concurrent queries and exhausted the
  // connection pool (P2024) — the list endpoint 500'd and the admin UI rendered an
  // empty "no publishers yet" state. Two groupBy queries replace all of it.
  const emptyPublisherCounts = () => ({ articles: 0, books: 0, articlesPublished: 0, articlesPending: 0, articlesRejected: 0, totalReads: 0 });
  const getPublisherCountsMap = async () => {
    const map: Record<string, ReturnType<typeof emptyPublisherCounts>> = {};
    const at = (id: string) => (map[id] ||= emptyPublisherCounts());
    const [artGroups, bookGroups] = await Promise.all([
      (prisma as any).article.groupBy({ by: ['publisherId', 'status'], _count: { _all: true }, _sum: { views: true } }),
      (prisma as any).book.groupBy({ by: ['publisherId'], _count: { _all: true }, _sum: { views: true } }),
    ]);
    for (const g of artGroups) {
      if (!g.publisherId) continue;
      const c = at(g.publisherId);
      const n = g._count._all;
      c.articles += n;
      c.totalReads += g._sum?.views || 0;
      if (g.status === 'Published') c.articlesPublished += n;
      else if (g.status === 'Draft') c.articlesPending += n;
      else if (g.status === 'Rejected') c.articlesRejected += n;
    }
    for (const g of bookGroups) {
      if (!g.publisherId) continue;
      const c = at(g.publisherId);
      c.books += g._count._all;
      c.totalReads += g._sum?.views || 0;
    }
    return (id: string) => map[id] || emptyPublisherCounts();
  };

  const resolvePublisherForUser = async (req: any) => {
    const uid = req.user?.uid || req.user?.id;
    if (!uid) return null;
    // Primary tie-up login (publisher.userId) OR an additional team seat (contact.userId)
    const direct = await (prisma as any).publisher.findFirst({ where: { userId: uid } });
    if (direct) return direct;
    const contact = await (prisma as any).publisherContact.findFirst({ where: { userId: uid }, include: { publisher: true } });
    return contact?.publisher || null;
  };

  const requirePublisher = (req: any, res: any, next: any) => {
    if (req.user?.role !== 'Publisher') return res.status(403).json({ error: "Publisher access only" });
    next();
  };

  // --- Admin: list publishers with counts ---
  app.get("/api/admin/publishers", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const { search, status } = req.query;
      const where: any = {};
      if (status) where.tieUpStatus = status;
      if (search) where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { country: { contains: search as string, mode: 'insensitive' } },
      ];
      const publishers = await (prisma as any).publisher.findMany({ where, orderBy: { createdAt: 'desc' } });
      const countsFor = await getPublisherCountsMap();
      res.json(publishers.map((p: any) => ({ ...p, counts: countsFor(p.id) })));
    } catch (e: any) { console.error("List publishers error:", e); res.status(500).json({ error: "Failed to fetch publishers" }); }
  });

  // --- Admin: create publisher manually ---
  app.post("/api/admin/publishers", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const { name, email, contactNumber, website, country, address, agreementNote, allowedContentTypes } = req.body;
      if (!name) return res.status(400).json({ error: "Publisher name is required" });
      const publisher = await (prisma as any).publisher.create({
        data: {
          name, email: email || null, contactNumber: contactNumber || null, website: website || null,
          country: country || null, address: address || null, agreementNote: agreementNote || null,
          allowedContentTypes: allowedContentTypes || ["Journals", "Books"],
          tieUpStatus: 'Discovered', source: 'Manual',
        }
      });
      res.json(publisher);
    } catch (e: any) { console.error("Create publisher error:", e); res.status(500).json({ error: "Failed to create publisher" }); }
  });

  // --- Admin: publisher detail (full profile: locations, contacts, agreements, tree) ---
  app.get("/api/admin/publishers/:id", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const publisher = await (prisma as any).publisher.findUnique({
        where: { id: req.params.id },
        include: {
          locations: { orderBy: { isPrimary: 'desc' } },
          contacts: { orderBy: { isPrimary: 'desc' } },
          agreements: { orderBy: { createdAt: 'desc' } },
          children: { orderBy: { name: 'asc' } },
          parent: true,
        },
      });
      if (!publisher) return res.status(404).json({ error: "Publisher not found" });
      res.json({ ...publisher, counts: await getPublisherCounts(publisher.id) });
    } catch (e: any) { console.error("publisher detail:", e); res.status(500).json({ error: "Failed to fetch publisher" }); }
  });

  // --- Admin: update publisher ---
  app.put("/api/admin/publishers/:id", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const { name, legalName, email, contactNumber, website, country, address, logoUrl, verified, orgType, parentId, agreementNote, allowedContentTypes, tieUpStatus } = req.body;
      const data: any = {};
      for (const [k, v] of Object.entries({ name, legalName, email, contactNumber, website, country, address, logoUrl, verified, orgType, agreementNote, allowedContentTypes, tieUpStatus })) {
        if (v !== undefined) data[k] = v;
      }
      // parentId: allow set/clear, but never let a node be its own parent
      if (parentId !== undefined) data.parentId = (parentId && parentId !== req.params.id) ? parentId : null;
      const publisher = await (prisma as any).publisher.update({ where: { id: req.params.id }, data });
      res.json(publisher);
    } catch (e: any) { res.status(500).json({ error: "Failed to update publisher" }); }
  });

  // --- Admin: TIE UP — create publisher login + email credentials ---
  app.post("/api/admin/publishers/:id/tieup", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { email, contactNumber, website, country, address, agreementNote, allowedContentTypes } = req.body;
      const publisher = await (prisma as any).publisher.findUnique({ where: { id } });
      if (!publisher) return res.status(404).json({ error: "Publisher not found" });

      const loginEmail = (email || publisher.email || "").trim().toLowerCase();
      if (!loginEmail) return res.status(400).json({ error: "Email is required to create publisher login" });

      let user = await prisma.user.findUnique({ where: { email: loginEmail } });
      let generatedPassword = "";
      if (!user) {
        generatedPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase() + "!";
        const hashed = await bcrypt.hash(generatedPassword, 10);
        user = await prisma.user.create({
          data: { email: loginEmail, password: hashed, displayName: publisher.name, role: 'Publisher', status: 'Active', isFirstLogin: true }
        });
      } else {
        await prisma.user.update({ where: { id: user.id }, data: { role: 'Publisher' } });
      }

      const updated = await (prisma as any).publisher.update({
        where: { id },
        data: {
          email: loginEmail,
          contactNumber: contactNumber ?? publisher.contactNumber,
          website: website ?? publisher.website,
          country: country ?? publisher.country,
          address: address ?? publisher.address,
          agreementNote: agreementNote ?? publisher.agreementNote,
          allowedContentTypes: allowedContentTypes ?? publisher.allowedContentTypes,
          tieUpStatus: 'Active',
          userId: user.id,
        }
      });

      try {
        const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || COMPANY_DETAILS.email).trim();
        const credsBlock = generatedPassword
          ? eRows([
              ['Login email', esc(loginEmail)],
              ['Temporary password', `<span style="font-family:Consolas,Menlo,monospace;font-size:15px;font-weight:700;letter-spacing:0.5px;color:#1e3a6e;">${esc(generatedPassword)}</span>`],
            ]) + eCard(`Please change this password the first time you sign in.`, 'warning')
          : eCard(`Sign in with your existing account — <b>${esc(loginEmail)}</b>.`, 'info');

        const html = buildEmail(eBody(
          eH1(`You're invited to partner with STM Digital Library`) +
          eP(`Dear ${esc(publisher.name)},`) +
          eP(`We would be glad to have ${esc(publisher.name)} on STM Digital Library. Sharing your open-access content puts your journals in front of the institutions and researchers already searching our platform — which means more readership, and more citations.`) +
          eP(`Your publisher account is ready:`) +
          credsBlock +
          eBtn('Sign in to your dashboard', `${MAIL_BASE}/publisher`) +
          eP(`From your dashboard you can submit and manage your catalogue, correct metadata, see readership analytics for your own titles, and withdraw any item at any time without going through us.`) +
          eMuted(`Have a question before you begin? Simply reply to this email — it reaches our team directly.`)
        ), `Your publisher account for ${publisher.name} is ready`);

        await sendMail({
          from: `"STM Digital Library" <${emailFrom}>`,
          to: [loginEmail, ADMIN_INBOX],
          subject: "Partnership Invitation & Login — STM Digital Library",
          html,
          text:
            `Dear ${publisher.name},\n\n` +
            `You're invited to partner with STM Digital Library.\n\n` +
            (generatedPassword
              ? `Login email: ${loginEmail}\nTemporary password: ${generatedPassword}\n(Please change it on first sign-in.)\n\n`
              : `Sign in with your existing account: ${loginEmail}\n\n`) +
            `Dashboard: ${MAIL_BASE}/publisher\n\n` +
            `From your dashboard you can manage your catalogue, correct metadata, see analytics for your own titles, and withdraw any item at any time.\n\n` +
            `— STM Digital Library Team`,
        });
      } catch (mailErr) { console.error("Tie-up email failed:", mailErr); }

      // Return the credentials so the admin can copy/share them directly —
      // never depend on email delivery (which may land in spam).
      res.json({ ...updated, credentialsSent: true, loginEmail, tempPassword: generatedPassword || null });
    } catch (e: any) { console.error("Tie-up error:", e); res.status(500).json({ error: "Failed to tie up publisher" }); }
  });

  // --- Admin: delete publisher ---
  app.delete("/api/admin/publishers/:id", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try { await (prisma as any).publisher.delete({ where: { id: req.params.id } }); res.json({ message: "Publisher removed" }); }
    catch (e: any) { res.status(500).json({ error: "Failed to delete publisher (it may have linked content)" }); }
  });

  // --- Admin: create content on a publisher's behalf ---
  app.post("/api/admin/publishers/:id/articles", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const publisher = await (prisma as any).publisher.findUnique({ where: { id: req.params.id } });
      if (!publisher) return res.status(404).json({ error: "Publisher not found" });
      const article = await (prisma as any).article.create({ data: mapArticleInput(req.body, publisher, req.body.status || 'Published', req.user?.email || 'Admin', 'AdminEntered') });
      res.json(article);
    } catch (e: any) { console.error(e); res.status(500).json({ error: "Failed to create article" }); }
  });
  app.post("/api/admin/publishers/:id/books", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const publisher = await (prisma as any).publisher.findUnique({ where: { id: req.params.id } });
      if (!publisher) return res.status(404).json({ error: "Publisher not found" });
      const book = await (prisma as any).book.create({ data: mapBookInput(req.body, publisher, req.body.status || 'Published', req.user?.email || 'Admin', 'AdminEntered') });
      res.json(book);
    } catch (e: any) { res.status(500).json({ error: "Failed to create book" }); }
  });

  // --- Admin/Manager: REVIEW queue + approve/reject ---
  app.get("/api/admin/review/pending", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const [articles, books] = await Promise.all([
        (prisma as any).article.findMany({ where: { status: 'Draft' }, orderBy: { createdAt: 'desc' }, take: 200 }),
        (prisma as any).book.findMany({ where: { status: 'Draft' }, orderBy: { createdAt: 'desc' }, take: 200 }),
      ]);
      res.json({ articles, books });
    } catch (e: any) { res.status(500).json({ error: "Failed to fetch review queue" }); }
  });

  const reviewAction = (model: 'article' | 'book') => async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { action, note } = req.body;
      if (action === 'approve') {
        const updated = await (prisma as any)[model].update({ where: { id }, data: { status: 'Published', rejectionNote: null } });
        return res.json(updated);
      } else if (action === 'reject') {
        const updated = await (prisma as any)[model].update({ where: { id }, data: { status: 'Rejected', rejectionNote: note || 'Rejected by reviewer' } });
        return res.json(updated);
      }
      res.status(400).json({ error: "Invalid action (use approve|reject)" });
    } catch (e: any) { res.status(500).json({ error: "Review action failed" }); }
  };
  app.post("/api/admin/review/article/:id", authenticateJWT, requireAdminOrManager, reviewAction('article'));
  app.post("/api/admin/review/book/:id", authenticateJWT, requireAdminOrManager, reviewAction('book'));

  // ---- Publisher self endpoints (role: Publisher) ----
  app.get("/api/publisher/me", authenticateJWT, requirePublisher, async (req: any, res: any) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.status(404).json({ error: "No publisher profile linked to this account" });
      res.json({ ...publisher, counts: await getPublisherCounts(publisher.id, true) });
    } catch (e: any) { res.status(500).json({ error: "Failed to load profile" }); }
  });

  app.get("/api/publisher/content", authenticateJWT, requirePublisher, async (req: any, res: any) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.json({ articles: [], books: [] });
      // STEALTH: a publisher only ever sees content THEY provided — never the
      // pre-scraped (Ingested) rows we collected before any partnership existed.
      const own = { publisherId: publisher.id, ownershipSource: { not: 'Ingested' } };
      const [articles, books] = await Promise.all([
        (prisma as any).article.findMany({ where: own, orderBy: { createdAt: 'desc' } }),
        (prisma as any).book.findMany({ where: own, orderBy: { createdAt: 'desc' }, include: { chapters: true } }),
      ]);
      res.json({ articles, books });
    } catch (e: any) { res.status(500).json({ error: "Failed to load content" }); }
  });

  app.post("/api/publisher/articles", authenticateJWT, requirePublisher, async (req: any, res: any) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.status(404).json({ error: "No publisher profile" });
      const article = await (prisma as any).article.create({ data: mapArticleInput(req.body, publisher, 'Draft', publisher.name) });
      res.json(article);
    } catch (e: any) { console.error(e); res.status(500).json({ error: "Failed to submit article" }); }
  });

  app.post("/api/publisher/books", authenticateJWT, requirePublisher, async (req: any, res: any) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.status(404).json({ error: "No publisher profile" });
      const book = await (prisma as any).book.create({ data: mapBookInput(req.body, publisher, 'Draft', publisher.name) });
      res.json(book);
    } catch (e: any) { res.status(500).json({ error: "Failed to submit book" }); }
  });

  app.put("/api/publisher/articles/:id", authenticateJWT, requirePublisher, async (req: any, res: any) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      const existing = await (prisma as any).article.findUnique({ where: { id: req.params.id } });
      if (!existing || existing.publisherId !== publisher?.id || existing.ownershipSource === 'Ingested') return res.status(403).json({ error: "Not your article" });
      const data: any = mapArticleInput(req.body, publisher, 'Draft', publisher.name);
      delete data.publisherId; delete data.publisherName;
      const article = await (prisma as any).article.update({ where: { id: req.params.id }, data: { ...data, status: 'Draft', rejectionNote: null } });
      res.json(article);
    } catch (e: any) { res.status(500).json({ error: "Failed to update article" }); }
  });
  app.put("/api/publisher/books/:id", authenticateJWT, requirePublisher, async (req: any, res: any) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      const existing = await (prisma as any).book.findUnique({ where: { id: req.params.id } });
      if (!existing || existing.publisherId !== publisher?.id || existing.ownershipSource === 'Ingested') return res.status(403).json({ error: "Not your book" });
      const data: any = mapBookInput(req.body, publisher, 'Draft', publisher.name);
      delete data.publisherId; delete data.publisherName;
      const book = await (prisma as any).book.update({ where: { id: req.params.id }, data: { ...data, status: 'Draft', rejectionNote: null } });
      res.json(book);
    } catch (e: any) { res.status(500).json({ error: "Failed to update book" }); }
  });

  // ==========================================
  // PUBLISHER PARTNERSHIP PORTAL — hierarchy, locations, contacts,
  // agreements + in-app e-signature, file uploads, bulk data-sharing.
  // ==========================================

  // --- File upload (base64 -> disk, served at /uploads). Swap for S3 when a bucket is provisioned. ---
  // UPLOAD_DIR is env-overridable so a persistent volume can be mounted in Docker/Coolify
  // (the container filesystem is wiped on every redeploy — uploads must live on a volume).
  const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(APP_DIR, 'uploads');
  app.use('/uploads', express.static(UPLOAD_DIR));
  const saveDataUrl = async (dataUrl: string, filename: string) => {
    const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || '');
    if (!m) throw new Error('Invalid file data');
    const buf = Buffer.from(m[2], 'base64');
    const fs = await import('node:fs');
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const safe = (filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    return `/uploads/${name}`;
  };
  app.post("/api/upload", authenticateJWT, async (req: any, res: any) => {
    try {
      const { dataUrl, filename } = req.body;
      if (!dataUrl) return res.status(400).json({ error: "No file provided" });
      res.json({ url: await saveDataUrl(dataUrl, filename || 'upload') });
    } catch (e: any) { console.error("upload:", e); res.status(500).json({ error: "Upload failed" }); }
  });

  // ==========================================
  // MEDIA LIBRARY — WordPress-style asset manager for the SuperAdmin.
  // Upload once, get a permanent public URL, reuse it anywhere.
  // Files: <UPLOAD_DIR>/media/<stored-name>  →  served at /uploads/media/<stored-name>
  // ==========================================
  const MEDIA_DIR = path.join(UPLOAD_DIR, 'media');

  // Body arrives as a base64 data URL inside JSON, which inflates the payload ~33%.
  // express.json is capped at 50mb, so keep the real-file ceiling comfortably under that.
  const MEDIA_MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file

  // Extension -> { mime, kind }. Whitelist only: anything not listed is rejected,
  // which keeps .html/.svg/.js (stored-XSS carriers) and executables out of a
  // directory we serve statically.
  const MEDIA_TYPES: Record<string, { mime: string; kind: string }> = {
    jpg:  { mime: 'image/jpeg', kind: 'image' },
    jpeg: { mime: 'image/jpeg', kind: 'image' },
    png:  { mime: 'image/png',  kind: 'image' },
    gif:  { mime: 'image/gif',  kind: 'image' },
    webp: { mime: 'image/webp', kind: 'image' },
    avif: { mime: 'image/avif', kind: 'image' },
    bmp:  { mime: 'image/bmp',  kind: 'image' },
    ico:  { mime: 'image/x-icon', kind: 'image' },
    pdf:  { mime: 'application/pdf', kind: 'pdf' },
    doc:  { mime: 'application/msword', kind: 'document' },
    docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'document' },
    rtf:  { mime: 'application/rtf', kind: 'document' },
    txt:  { mime: 'text/plain', kind: 'document' },
    md:   { mime: 'text/markdown', kind: 'document' },
    xls:  { mime: 'application/vnd.ms-excel', kind: 'spreadsheet' },
    xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'spreadsheet' },
    csv:  { mime: 'text/csv', kind: 'spreadsheet' },
    ppt:  { mime: 'application/vnd.ms-powerpoint', kind: 'presentation' },
    pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'presentation' },
    mp4:  { mime: 'video/mp4', kind: 'video' },
    webm: { mime: 'video/webm', kind: 'video' },
    mp3:  { mime: 'audio/mpeg', kind: 'audio' },
    wav:  { mime: 'audio/wav', kind: 'audio' },
    zip:  { mime: 'application/zip', kind: 'archive' },
  };
  const MEDIA_ALLOWED_EXT = Object.keys(MEDIA_TYPES);

  // Absolute URL so "Copy URL" in the UI yields a link that works when pasted anywhere.
  const absoluteUrl = (req: any, p: string) => {
    const base = (process.env.APP_URL || '').replace(/\/+$/, '')
      || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
    return `${base}${p}`;
  };
  const withAbsolute = (req: any, a: any) => ({ ...a, absoluteUrl: absoluteUrl(req, a.url) });

  // PNG / GIF / JPEG dimensions straight from the header bytes — no image lib needed.
  const readImageSize = (buf: Buffer, ext: string): { width?: number; height?: number } => {
    try {
      if (ext === 'png' && buf.length > 24 && buf.toString('ascii', 12, 16) === 'IHDR') {
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
      }
      if (ext === 'gif' && buf.length > 10) {
        return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
      }
      if ((ext === 'jpg' || ext === 'jpeg') && buf.length > 4) {
        let i = 2;
        while (i < buf.length - 9) {
          if (buf[i] !== 0xff) { i++; continue; }
          const marker = buf[i + 1];
          // SOF0..SOF15, excluding the non-frame markers DHT (c4), JPG (c8), DAC (cc)
          if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
            return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
          }
          i += 2 + buf.readUInt16BE(i + 2);
        }
      }
    } catch { /* dimensions are cosmetic — never fail an upload over them */ }
    return {};
  };

  // POST /api/admin/media — upload one file (base64 data URL) and get its public link back
  app.post("/api/admin/media", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const { dataUrl, filename, title, altText, caption, folder } = req.body || {};
      if (!dataUrl || typeof dataUrl !== 'string') return res.status(400).json({ error: "No file provided" });

      const m = /^data:([^;]*);base64,(.*)$/s.exec(dataUrl);
      if (!m) return res.status(400).json({ error: "Invalid file data" });

      const original = String(filename || 'file');
      const ext = (original.split('.').pop() || '').toLowerCase();
      const type = MEDIA_TYPES[ext];
      if (!type) {
        return res.status(400).json({ error: `File type ".${ext}" is not allowed. Allowed: ${MEDIA_ALLOWED_EXT.join(', ')}` });
      }

      const buf = Buffer.from(m[2], 'base64');
      if (!buf.length) return res.status(400).json({ error: "File is empty" });
      if (buf.length > MEDIA_MAX_BYTES) {
        return res.status(413).json({ error: `File is too large (${(buf.length / 1048576).toFixed(1)} MB). Maximum is 25 MB.` });
      }

      const fsm = await import('node:fs');
      fsm.mkdirSync(MEDIA_DIR, { recursive: true });
      // Sanitise + uniquify: the stored name never contains path separators, and a
      // re-upload of "logo.png" can never overwrite the existing one.
      const base = original.replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 60) || 'file';
      const stored = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${base}.${ext}`;
      fsm.writeFileSync(path.join(MEDIA_DIR, stored), buf);

      const dims = type.kind === 'image' ? readImageSize(buf, ext) : {};
      const asset = await (prisma as any).mediaAsset.create({
        data: {
          fileName: stored,
          originalName: original,
          url: `/uploads/media/${stored}`,
          mimeType: type.mime,
          ext,
          kind: type.kind,
          size: buf.length,
          width: dims.width ?? null,
          height: dims.height ?? null,
          title: title || original.replace(/\.[^.]*$/, ''),
          altText: altText || null,
          caption: caption || null,
          folder: folder || null,
          uploadedBy: req.user?.email || null,
          uploadedById: req.user?.uid || null,
        },
      });
      res.json(withAbsolute(req, asset));
    } catch (e: any) {
      console.error("media upload:", e);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // GET /api/admin/media — paginated list with search + kind filter
  app.get("/api/admin/media", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const take = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 40));
      const q = (req.query.q as string || '').trim();
      const kind = (req.query.kind as string || '').trim();

      const where: any = {};
      if (kind && kind !== 'all') where.kind = kind;
      if (q) {
        where.OR = [
          { originalName: { contains: q, mode: 'insensitive' } },
          { title: { contains: q, mode: 'insensitive' } },
          { altText: { contains: q, mode: 'insensitive' } },
          { caption: { contains: q, mode: 'insensitive' } },
        ];
      }

      const [items, total, grouped] = await Promise.all([
        (prisma as any).mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take }),
        (prisma as any).mediaAsset.count({ where }),
        (prisma as any).mediaAsset.groupBy({ by: ['kind'], _count: { _all: true }, _sum: { size: true } }),
      ]);

      const counts: Record<string, number> = {};
      let totalSize = 0;
      grouped.forEach((g: any) => { counts[g.kind] = g._count._all; totalSize += g._sum.size || 0; });

      res.json({
        data: items.map((a: any) => withAbsolute(req, a)),
        total, page, limit: take,
        counts, totalSize,
      });
    } catch (e: any) {
      console.error("media list:", e);
      res.status(500).json({ error: "Failed to load media" });
    }
  });

  // PUT /api/admin/media/:id — edit metadata (title / alt / caption / folder)
  app.put("/api/admin/media/:id", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const { title, altText, caption, folder } = req.body || {};
      const data: any = {};
      if (title !== undefined) data.title = title || null;
      if (altText !== undefined) data.altText = altText || null;
      if (caption !== undefined) data.caption = caption || null;
      if (folder !== undefined) data.folder = folder || null;
      const asset = await (prisma as any).mediaAsset.update({ where: { id: req.params.id }, data });
      res.json(withAbsolute(req, asset));
    } catch (e: any) {
      console.error("media update:", e);
      res.status(500).json({ error: "Failed to update media" });
    }
  });

  // DELETE /api/admin/media/:id — remove the row and the file on disk
  app.delete("/api/admin/media/:id", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const asset = await (prisma as any).mediaAsset.findUnique({ where: { id: req.params.id } });
      if (!asset) return res.status(404).json({ error: "Not found" });
      try {
        const fsm = await import('node:fs');
        // basename() guards against a crafted fileName escaping MEDIA_DIR
        const onDisk = path.join(MEDIA_DIR, path.basename(asset.fileName));
        if (fsm.existsSync(onDisk)) fsm.unlinkSync(onDisk);
      } catch (fileErr) {
        // A missing file shouldn't block removing the record it points at.
        console.error("media delete (file):", fileErr);
      }
      await (prisma as any).mediaAsset.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (e: any) {
      console.error("media delete:", e);
      res.status(500).json({ error: "Failed to delete media" });
    }
  });

  // --- Publisher hierarchy tree (Group -> Publisher -> Imprint), arbitrary depth ---
  app.get("/api/admin/publisher-tree", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const all = await (prisma as any).publisher.findMany({ orderBy: { name: 'asc' } });
      const countsFor = await getPublisherCountsMap();
      const byId: Record<string, any> = {};
      all.forEach((p: any) => { byId[p.id] = { ...p, counts: countsFor(p.id), children: [] }; });
      const roots: any[] = [];
      all.forEach((p: any) => {
        if (p.parentId && byId[p.parentId]) byId[p.parentId].children.push(byId[p.id]);
        else roots.push(byId[p.id]);
      });
      res.json(roots);
    } catch (e: any) { console.error("publisher tree:", e); res.status(500).json({ error: "Failed to build tree" }); }
  });

  // --- Locations (multi-country / multi-office) ---
  app.post("/api/admin/publishers/:id/locations", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const { label, type, country, city, address, isPrimary } = req.body;
      const loc = await (prisma as any).publisherLocation.create({ data: { publisherId: req.params.id, label: label || null, type: type || 'Office', country: country || null, city: city || null, address: address || null, isPrimary: !!isPrimary } });
      res.json(loc);
    } catch (e: any) { res.status(500).json({ error: "Failed to add location" }); }
  });
  app.put("/api/admin/locations/:id", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const data: any = {};
      for (const k of ['label', 'type', 'country', 'city', 'address', 'isPrimary']) if (req.body[k] !== undefined) data[k] = req.body[k];
      res.json(await (prisma as any).publisherLocation.update({ where: { id: req.params.id }, data }));
    } catch (e: any) { res.status(500).json({ error: "Failed to update location" }); }
  });
  app.delete("/api/admin/locations/:id", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try { await (prisma as any).publisherLocation.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: "Failed to delete location" }); }
  });

  // --- Contacts (+ optional login seat = multi-seat teams) ---
  app.post("/api/admin/publishers/:id/contacts", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const { name, email, title, phone, isPrimary } = req.body;
      if (!name) return res.status(400).json({ error: "Contact name is required" });
      const c = await (prisma as any).publisherContact.create({ data: { publisherId: req.params.id, name, email: email || null, title: title || null, phone: phone || null, isPrimary: !!isPrimary } });
      res.json(c);
    } catch (e: any) { res.status(500).json({ error: "Failed to add contact" }); }
  });
  app.put("/api/admin/contacts/:id", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const data: any = {};
      for (const k of ['name', 'email', 'title', 'phone', 'isPrimary']) if (req.body[k] !== undefined) data[k] = req.body[k];
      res.json(await (prisma as any).publisherContact.update({ where: { id: req.params.id }, data }));
    } catch (e: any) { res.status(500).json({ error: "Failed to update contact" }); }
  });
  app.delete("/api/admin/contacts/:id", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try { await (prisma as any).publisherContact.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: "Failed to delete contact" }); }
  });
  // Give a contact their own login seat (scoped to this publisher node)
  app.post("/api/admin/contacts/:id/invite", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const contact = await (prisma as any).publisherContact.findUnique({ where: { id: req.params.id }, include: { publisher: true } });
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      const loginEmail = (contact.email || '').trim().toLowerCase();
      if (!loginEmail) return res.status(400).json({ error: "Contact needs an email to receive a login" });
      let user = await prisma.user.findUnique({ where: { email: loginEmail } });
      let tempPassword = '';
      if (!user) {
        tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase() + "!";
        user = await prisma.user.create({ data: { displayName: contact.name, email: loginEmail, password: await bcrypt.hash(tempPassword, 10), role: 'Publisher', status: 'Active', isFirstLogin: true } });
      } else if (user.role !== 'Publisher') {
        user = await prisma.user.update({ where: { id: user.id }, data: { role: 'Publisher' } });
      }
      await (prisma as any).publisherContact.update({ where: { id: contact.id }, data: { userId: user.id, scopeNodeId: contact.publisherId } });
      res.json({ ok: true, email: loginEmail, tempPassword: tempPassword || null, note: tempPassword ? 'Share these credentials securely.' : 'Existing account upgraded to a publisher seat.' });
    } catch (e: any) { console.error("contact invite:", e); res.status(500).json({ error: "Failed to create seat" }); }
  });

  // --- Merge a duplicate publisher into a target (moves all content + relations) ---
  app.post("/api/admin/publishers/:id/merge", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const from = req.params.id; const to = req.body.targetId;
      if (!to || to === from) return res.status(400).json({ error: "Pick a different target publisher" });
      const target = await (prisma as any).publisher.findUnique({ where: { id: to } });
      if (!target) return res.status(404).json({ error: "Target publisher not found" });
      await (prisma as any).journal.updateMany({ where: { publisherId: from }, data: { publisherId: to, publisherName: target.name } });
      await (prisma as any).article.updateMany({ where: { publisherId: from }, data: { publisherId: to, publisherName: target.name } });
      await (prisma as any).book.updateMany({ where: { publisherId: from }, data: { publisherId: to, publisherName: target.name } });
      await (prisma as any).publisherLocation.updateMany({ where: { publisherId: from }, data: { publisherId: to } });
      await (prisma as any).publisherContact.updateMany({ where: { publisherId: from }, data: { publisherId: to } });
      await (prisma as any).publisherAgreement.updateMany({ where: { publisherId: from }, data: { publisherId: to } });
      await (prisma as any).publisher.updateMany({ where: { parentId: from }, data: { parentId: to } });
      await (prisma as any).publisher.delete({ where: { id: from } });
      res.json({ ok: true, mergedInto: to });
    } catch (e: any) { console.error("merge:", e); res.status(500).json({ error: "Merge failed" }); }
  });

  // --- Agreements + in-app e-signature ---
  /** Everyone on the publisher's side worth notifying: the account, then its contacts. */
  const publisherRecipients = (publisher: any): string[] => {
    const list = [publisher?.email, ...(publisher?.contacts || []).map((c: any) => c.email)]
      .filter((e: any) => typeof e === 'string' && e.includes('@'));
    return Array.from(new Set(list.map((e: string) => e.trim())));
  };

  const pushAudit = (agreement: any, event: string, by: string | null, req: any) => {
    const trail = Array.isArray(agreement.auditTrail) ? agreement.auditTrail : [];
    trail.push({ event, by: by || null, ip: req.ip || req.headers['x-forwarded-for'] || null, at: new Date().toISOString() });
    return trail;
  };
  app.post("/api/admin/publishers/:id/agreements", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const { title, documentUrl, body, version, note } = req.body;
      if (!title) return res.status(400).json({ error: "Agreement title is required" });
      const ag = await (prisma as any).publisherAgreement.create({
        data: { publisherId: req.params.id, title, documentUrl: documentUrl || null, body: body || null, version: version || '1.0', note: note || null, status: 'Draft', createdBy: req.user?.email || 'Admin', auditTrail: [{ event: 'created', by: req.user?.email || 'Admin', at: new Date().toISOString() }] },
      });
      res.json(ag);
    } catch (e: any) { console.error("create agreement:", e); res.status(500).json({ error: "Failed to create agreement" }); }
  });
  app.post("/api/admin/agreements/:id/send", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const ag = await (prisma as any).publisherAgreement.findUnique({
        where: { id: req.params.id },
        include: { publisher: { include: { contacts: true } } },
      });
      if (!ag) return res.status(404).json({ error: "Agreement not found" });
      const updated = await (prisma as any).publisherAgreement.update({ where: { id: ag.id }, data: { status: 'Sent', sentAt: new Date(), auditTrail: pushAudit(ag, 'sent', req.user?.email || 'Admin', req) } });

      // Notify the publisher. Delivery must never fail the send — the agreement
      // is already marked Sent and is waiting in their portal either way.
      const to = publisherRecipients(ag.publisher);
      if (to.length) {
        const name = ag.publisher?.name || 'there';
        sendMail({
          to,
          subject: `Agreement for your signature — ${ag.title}`,
          html: buildEmail(eBody(
            eH1(`An agreement is ready for your signature`) +
            eP(`Dear ${esc(name)},`) +
            eP(`We have prepared the agreement below for your review. You can read it in full, and sign or decline it, from your publisher dashboard — no printing, scanning or posting required.`) +
            eRows([
              ['Agreement', esc(ag.title)],
              ['Version', esc(ag.version || '1.0')],
              ['Prepared for', esc(name)],
            ]) +
            eBtn('Review &amp; sign the agreement', `${MAIL_BASE}/publisher`) +
            (ag.documentUrl ? eCard(`A signed copy of the contract PDF is attached to this agreement in your dashboard.`, 'info') : '') +
            eCard(`Signing is entirely your choice. If anything in the agreement does not suit you, decline it and tell us why — we will revise it. You may also simply reply to this email.`, 'neutral') +
            eMuted(`This link opens your publisher dashboard. If you cannot sign in, reply to this email and we will help.`)
          ), `${ag.title} — ready for your review and signature`),
          text:
            `Dear ${name},\n\n` +
            `An agreement is ready for your signature.\n\n` +
            `Agreement: ${ag.title}\nVersion: ${ag.version || '1.0'}\n\n` +
            `Review and sign it here: ${MAIL_BASE}/publisher\n\n` +
            `Signing is your choice. If anything does not suit you, decline it and tell us why, or simply reply to this email.\n\n` +
            `— STM Digital Library Team`,
        }).catch(e => console.error("agreement send mail:", e));
      }
      res.json(updated);
    } catch (e: any) { console.error("send agreement:", e); res.status(500).json({ error: "Failed to send agreement" }); }
  });
  app.delete("/api/admin/agreements/:id", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try { await (prisma as any).publisherAgreement.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: "Failed to delete agreement" }); }
  });

  // Publisher-side agreement view + e-sign
  app.get("/api/publisher/agreements", authenticateJWT, requirePublisher, async (req: any, res: any) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.json([]);
      const list = await (prisma as any).publisherAgreement.findMany({ where: { publisherId: publisher.id }, orderBy: { createdAt: 'desc' } });
      // First open of a Sent agreement -> Viewed
      await Promise.all(list.filter((a: any) => a.status === 'Sent').map((a: any) =>
        (prisma as any).publisherAgreement.update({ where: { id: a.id }, data: { status: 'Viewed', viewedAt: new Date(), auditTrail: pushAudit(a, 'viewed', publisher.name, req) } })
      ));
      res.json(list);
    } catch (e: any) { res.status(500).json({ error: "Failed to load agreements" }); }
  });
  app.post("/api/publisher/agreements/:id/sign", authenticateJWT, requirePublisher, async (req: any, res: any) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      const ag = await (prisma as any).publisherAgreement.findUnique({ where: { id: req.params.id } });
      if (!ag || ag.publisherId !== publisher?.id) return res.status(403).json({ error: "Not your agreement" });
      if (ag.status === 'Accepted') return res.status(400).json({ error: "Already signed" });
      const { signatureType, signatureData, name, email } = req.body;
      if (!signatureData || !name) return res.status(400).json({ error: "A signature and signer name are required" });
      const updated = await (prisma as any).publisherAgreement.update({
        where: { id: ag.id },
        data: {
          status: 'Accepted', decidedAt: new Date(), acceptedByName: name, acceptedByEmail: email || null,
          signatureType: signatureType || 'typed', signatureData, ipAddress: req.ip || null, userAgent: req.headers['user-agent'] || null,
          auditTrail: pushAudit(ag, 'accepted', name, req),
        },
      });

      sendMail({
        to: ADMIN_INBOX,
        subject: `✅ Agreement signed — ${publisher.name}`,
        html: buildEmail(eBody(
          eH1(`${esc(publisher.name)} signed the agreement`) +
          eCard(`<b>${esc(ag.title)}</b> was accepted and is now legally on record with a full audit trail.`, 'success') +
          eRows([
            ['Publisher', esc(publisher.name)],
            ['Agreement', esc(ag.title)],
            ['Version', esc(ag.version || '1.0')],
            ['Signed by', esc(name)],
            ['Signer email', esc(email || '—')],
            ['Signature', esc(signatureType === 'drawn' ? 'Drawn' : 'Typed')],
            ['Signed at', esc(new Date().toLocaleString('en-IN'))],
            ['IP address', esc(req.ip || '—')],
          ]) +
          eBtn('Open the publisher record', `${MAIL_BASE}/admin/publishers`)
        ), `${publisher.name} accepted ${ag.title}`),
        text:
          `${publisher.name} signed the agreement "${ag.title}" (v${ag.version || '1.0'}).\n\n` +
          `Signed by: ${name}${email ? ` <${email}>` : ''}\n` +
          `Signature: ${signatureType === 'drawn' ? 'Drawn' : 'Typed'}\n` +
          `Signed at: ${new Date().toLocaleString('en-IN')}\nIP: ${req.ip || '—'}\n\n` +
          `${MAIL_BASE}/admin/publishers`,
      }).catch(e => console.error("agreement signed mail:", e));

      res.json(updated);
    } catch (e: any) { console.error("sign agreement:", e); res.status(500).json({ error: "Failed to sign" }); }
  });
  app.post("/api/publisher/agreements/:id/decline", authenticateJWT, requirePublisher, async (req: any, res: any) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      const ag = await (prisma as any).publisherAgreement.findUnique({ where: { id: req.params.id } });
      if (!ag || ag.publisherId !== publisher?.id) return res.status(403).json({ error: "Not your agreement" });
      const updated = await (prisma as any).publisherAgreement.update({ where: { id: ag.id }, data: { status: 'Declined', decidedAt: new Date(), declineReason: req.body.reason || null, auditTrail: pushAudit(ag, 'declined', publisher.name, req) } });

      sendMail({
        to: ADMIN_INBOX,
        subject: `Agreement declined — ${publisher.name}`,
        html: buildEmail(eBody(
          eH1(`${esc(publisher.name)} declined the agreement`) +
          eRows([
            ['Publisher', esc(publisher.name)],
            ['Agreement', esc(ag.title)],
            ['Version', esc(ag.version || '1.0')],
            ['Declined at', esc(new Date().toLocaleString('en-IN'))],
          ]) +
          (req.body.reason
            ? eCard(`<b>Reason given</b><br/>${escLines(req.body.reason)}`, 'warning')
            : eCard(`No reason was given. It may be worth asking what would need to change.`, 'neutral')) +
          eP(`Nothing further happens automatically. You can revise the terms and send a fresh agreement whenever you are ready.`) +
          eBtn('Open the publisher record', `${MAIL_BASE}/admin/publishers`)
        ), `${publisher.name} declined ${ag.title}`),
        text:
          `${publisher.name} declined the agreement "${ag.title}" (v${ag.version || '1.0'}).\n\n` +
          `Reason: ${req.body.reason || 'none given'}\n` +
          `Declined at: ${new Date().toLocaleString('en-IN')}\n\n` +
          `${MAIL_BASE}/admin/publishers`,
      }).catch(e => console.error("agreement declined mail:", e));

      res.json(updated);
    } catch (e: any) { console.error("decline agreement:", e); res.status(500).json({ error: "Failed to decline" }); }
  });

  // --- Publisher bulk data-sharing: many rows -> a tracked batch -> Draft items ---
  app.post("/api/publisher/uploads", authenticateJWT, requirePublisher, async (req: any, res: any) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.status(404).json({ error: "No publisher profile" });
      const { kind = 'article', fileName, items } = req.body;
      if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "No rows to import" });
      const batch = await (prisma as any).publisherUpload.create({ data: { publisherId: publisher.id, kind, fileName: fileName || null, rows: items.length, status: 'Pending', createdBy: publisher.name } });
      let accepted = 0, rejected = 0;
      for (const row of items) {
        try {
          if (!row.title) { rejected++; continue; }
          const data = kind === 'book'
            ? mapBookInput({ ...row, uploadId: batch.id }, publisher, 'Draft', publisher.name)
            : mapArticleInput({ ...row, uploadId: batch.id }, publisher, 'Draft', publisher.name);
          await (prisma as any)[kind === 'book' ? 'book' : 'article'].create({ data });
          accepted++;
        } catch { rejected++; }
      }
      const done = await (prisma as any).publisherUpload.update({ where: { id: batch.id }, data: { accepted, rejected, status: 'Processed' } });
      res.json({ ...done, accepted, rejected });
    } catch (e: any) { console.error("publisher upload:", e); res.status(500).json({ error: "Bulk import failed" }); }
  });
  app.get("/api/publisher/uploads", authenticateJWT, requirePublisher, async (req: any, res: any) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.json([]);
      res.json(await (prisma as any).publisherUpload.findMany({ where: { publisherId: publisher.id }, orderBy: { createdAt: 'desc' } }));
    } catch (e: any) { res.status(500).json({ error: "Failed to load uploads" }); }
  });

  // --- Enhanced review: bulk approve/reject ---
  app.post("/api/admin/review/bulk", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const { model, ids, action, note } = req.body;
      if (!['article', 'book'].includes(model) || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "Provide model + ids" });
      const data = action === 'approve'
        ? { status: 'Published', rejectionNote: null }
        : { status: 'Rejected', rejectionNote: note || 'Rejected by reviewer' };
      const r = await (prisma as any)[model].updateMany({ where: { id: { in: ids } }, data });
      res.json({ ok: true, count: r.count });
    } catch (e: any) { res.status(500).json({ error: "Bulk review failed" }); }
  });

  // --- Agreement templates (reuse) ---
  app.get("/api/admin/agreement-templates", authenticateJWT, requireAdminOrManager, async (_req: any, res: any) => {
    try { res.json(await (prisma as any).agreementTemplate.findMany({ orderBy: { createdAt: 'desc' } })); }
    catch (e: any) { res.status(500).json({ error: "Failed to load templates" }); }
  });
  app.post("/api/admin/agreement-templates", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const { title, version, body } = req.body;
      if (!title) return res.status(400).json({ error: "Template title required" });
      res.json(await (prisma as any).agreementTemplate.create({ data: { title, version: version || '1.0', body: body || null, createdBy: req.user?.email || 'Admin' } }));
    } catch (e: any) { res.status(500).json({ error: "Failed to save template" }); }
  });
  app.delete("/api/admin/agreement-templates/:id", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try { await (prisma as any).agreementTemplate.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: "Failed to delete template" }); }
  });

  // --- Messaging (admin ↔ publisher) with read receipts ---
  app.get("/api/admin/publishers/:id/messages", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const msgs = await (prisma as any).publisherMessage.findMany({ where: { publisherId: req.params.id }, orderBy: { createdAt: 'asc' } });
      // admin has now read the publisher's messages → receipt for the publisher
      await (prisma as any).publisherMessage.updateMany({ where: { publisherId: req.params.id, sender: 'publisher', readAt: null }, data: { readAt: new Date() } });
      res.json(msgs);
    } catch (e: any) { res.status(500).json({ error: "Failed to load messages" }); }
  });
  app.post("/api/admin/publishers/:id/messages", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const { body, attachmentUrl } = req.body;
      if (!body?.trim() && !attachmentUrl) return res.status(400).json({ error: "Message is empty" });
      const msg = await (prisma as any).publisherMessage.create({ data: { publisherId: req.params.id, sender: 'admin', senderName: req.user?.email || 'STM Team', body: body || '', attachmentUrl: attachmentUrl || null } });

      // Nudge the publisher by email — they will not be sitting in the portal.
      const publisher = await (prisma as any).publisher.findUnique({ where: { id: req.params.id }, include: { contacts: true } });
      const to = publisherRecipients(publisher);
      if (to.length) {
        sendMail({
          to,
          subject: `New message from STM Digital Library`,
          html: buildEmail(eBody(
            eH1(`You have a new message`) +
            eP(`Dear ${esc(publisher?.name || 'there')},`) +
            eP(`The STM Digital Library team has sent you a message on your publisher dashboard:`) +
            eQuote('STM Digital Library Team', body || '(attachment only)') +
            (attachmentUrl ? eCard(`📎 A file is attached to this message in your dashboard.`, 'info') : '') +
            eBtn('Read and reply', `${MAIL_BASE}/publisher`) +
            eMuted(`Replying in the dashboard keeps the whole conversation in one place.`)
          ), (body || 'New message from STM Digital Library').slice(0, 120)),
          text:
            `Dear ${publisher?.name || 'there'},\n\n` +
            `New message from the STM Digital Library team:\n\n${body || '(attachment only)'}\n\n` +
            `Read and reply: ${MAIL_BASE}/publisher`,
        }).catch(e => console.error("publisher message mail:", e));
      }
      res.json(msg);
    } catch (e: any) { console.error("admin message:", e); res.status(500).json({ error: "Failed to send" }); }
  });
  app.get("/api/publisher/messages", authenticateJWT, requirePublisher, async (req: any, res: any) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.json([]);
      const msgs = await (prisma as any).publisherMessage.findMany({ where: { publisherId: publisher.id }, orderBy: { createdAt: 'asc' } });
      await (prisma as any).publisherMessage.updateMany({ where: { publisherId: publisher.id, sender: 'admin', readAt: null }, data: { readAt: new Date() } });
      res.json(msgs);
    } catch (e: any) { res.status(500).json({ error: "Failed to load messages" }); }
  });
  app.post("/api/publisher/messages", authenticateJWT, requirePublisher, async (req: any, res: any) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.status(404).json({ error: "No publisher profile" });
      const { body, attachmentUrl } = req.body;
      if (!body?.trim() && !attachmentUrl) return res.status(400).json({ error: "Message is empty" });
      const msg = await (prisma as any).publisherMessage.create({ data: { publisherId: publisher.id, sender: 'publisher', senderName: publisher.name, body: body || '', attachmentUrl: attachmentUrl || null } });

      sendMail({
        to: ADMIN_INBOX,
        subject: `New message from ${publisher.name}`,
        html: buildEmail(eBody(
          eH1(`${esc(publisher.name)} sent you a message`) +
          eQuote(publisher.name, body || '(attachment only)') +
          (attachmentUrl ? eCard(`📎 They attached a file — open the thread to download it.`, 'info') : '') +
          eBtn('Open the conversation', `${MAIL_BASE}/admin/publishers`)
        ), `${publisher.name}: ${(body || 'sent an attachment').slice(0, 100)}`),
        text:
          `${publisher.name} sent a message:\n\n${body || '(attachment only)'}\n\n` +
          `Open the conversation: ${MAIL_BASE}/admin/publishers`,
      }).catch(e => console.error("admin notify mail:", e));

      res.json(msg);
    } catch (e: any) { console.error("publisher message:", e); res.status(500).json({ error: "Failed to send" }); }
  });

  // Publisher notifications — unread messages from the STM team + agreements to sign (no mark-read)
  app.get("/api/publisher/notifications", authenticateJWT, requirePublisher, async (req: any, res: any) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.json({ total: 0, unreadMessages: 0, pendingAgreements: 0 });
      const [unreadMessages, pendingAgreements] = await Promise.all([
        (prisma as any).publisherMessage.count({ where: { publisherId: publisher.id, sender: 'admin', readAt: null } }),
        (prisma as any).publisherAgreement.count({ where: { publisherId: publisher.id, status: { in: ['Sent', 'Viewed'] } } }),
      ]);
      res.json({ total: unreadMessages + pendingAgreements, unreadMessages, pendingAgreements });
    } catch (e: any) { res.status(500).json({ error: "Failed to load notifications" }); }
  });

  // --- Reads analytics (time-series + top items) ---
  const readAnalytics = async (publisherId: string, days = 30) => {
    const since = new Date(Date.now() - days * 86400000);
    const series: any[] = await (prisma as any).$queryRaw`SELECT to_char(date_trunc('day', "at"), 'YYYY-MM-DD') as day, count(*)::int as reads FROM "ReadEvent" WHERE "publisherId" = ${publisherId} AND "at" >= ${since} GROUP BY 1 ORDER BY 1`;
    const topArticles = await (prisma as any).article.findMany({ where: { publisherId, ownershipSource: { not: 'Ingested' }, views: { gt: 0 } }, orderBy: { views: 'desc' }, take: 5, select: { id: true, title: true, views: true } });
    const totalReads = series.reduce((s: number, r: any) => s + Number(r.reads), 0);
    return { days, series, topArticles, totalReads };
  };
  app.get("/api/publisher/analytics", authenticateJWT, requirePublisher, async (req: any, res: any) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.json({ series: [], topArticles: [], totalReads: 0 });
      res.json(await readAnalytics(publisher.id, Math.min(parseInt(req.query.days) || 30, 120)));
    } catch (e: any) { console.error("pub analytics:", e); res.status(500).json({ error: "Failed to load analytics" }); }
  });
  app.get("/api/admin/publishers/:id/analytics", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try { res.json(await readAnalytics(req.params.id, Math.min(parseInt(req.query.days) || 30, 120))); }
    catch (e: any) { res.status(500).json({ error: "Failed to load analytics" }); }
  });

  // --- Admin notifications: unread publisher messages, pending reviews, recent signings ---
  app.get("/api/admin/notifications", authenticateJWT, requireAdminOrManager, async (_req: any, res: any) => {
    try {
      const unread = await (prisma as any).publisherMessage.findMany({
        where: { sender: 'publisher', readAt: null }, orderBy: { createdAt: 'desc' }, take: 30,
        include: { publisher: { select: { id: true, name: true } } },
      });
      const byPub: Record<string, any> = {};
      for (const m of unread) {
        const k = m.publisherId;
        if (!byPub[k]) byPub[k] = { publisherId: k, publisherName: m.publisher?.name || 'Publisher', count: 0, preview: m.body, at: m.createdAt };
        byPub[k].count++;
      }
      const messages = Object.values(byPub);
      const [pa, pb] = await Promise.all([
        (prisma as any).article.count({ where: { status: 'Draft' } }),
        (prisma as any).book.count({ where: { status: 'Draft' } }),
      ]);
      const reviewCount = pa + pb;
      const recent = await (prisma as any).publisherAgreement.findMany({
        where: { status: { in: ['Accepted', 'Declined'] }, decidedAt: { gte: new Date(Date.now() - 7 * 86400000) } },
        orderBy: { decidedAt: 'desc' }, take: 10, include: { publisher: { select: { name: true } } },
      });
      res.json({
        total: unread.length + reviewCount,
        unreadMessages: unread.length,
        messages,
        reviewCount,
        recentAgreements: recent.map((a: any) => ({ title: a.title, status: a.status, publisherName: a.publisher?.name, at: a.decidedAt })),
      });
    } catch (e: any) { console.error("notifications:", e); res.status(500).json({ error: "Failed to load notifications" }); }
  });

  // ==========================================
  // STRUCTURED INGESTION ENGINE (Phase 3C) — free/keyless open-access sources
  // OpenAlex + DOAJ -> new Article/Journal tables + Publisher auto-discovery
  // ==========================================

  const articleFingerprint = (doi: string | null, title: string, authors: string) => {
    if (doi) return `doi:${String(doi).toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}`;
    return `ta:${(title || '').toLowerCase().trim().slice(0, 180)}|${(authors || '').toLowerCase().trim().slice(0, 80)}`;
  };

  const upsertPublisherByName = async (name: string | null, source: string) => {
    if (!name) return null;
    const existing = await (prisma as any).publisher.findFirst({ where: { name } });
    if (existing) return existing;
    try { return await (prisma as any).publisher.create({ data: { name, tieUpStatus: 'Discovered', source } }); }
    catch { return (prisma as any).publisher.findFirst({ where: { name } }); }
  };

  const upsertJournalByIssn = async (issn: string | null, data: any) => {
    if (!issn) return null;
    const existing = await (prisma as any).journal.findUnique({ where: { issn } });
    if (existing) return existing;
    try { return await (prisma as any).journal.create({ data: { ...data, issn } }); }
    catch { return (prisma as any).journal.findUnique({ where: { issn } }); }
  };

  // Hosts whose OA PDFs are directly fetchable by our server (no Cloudflare/WAF/JS-challenge block).
  // Grounded by probing OpenAlex OA links live — OA-native publishers that return real PDF bytes to a server.
  // Anything not on this list (doi.org redirects, Wiley, ACS, RSC, ScienceDirect, MDPI, Hindawi, most repos)
  // is skipped because it only opens in a real browser, never in our in-app viewer.
  const TRUSTED_PDF_HOSTS = [
    'arxiv.org', 'biorxiv.org', 'medrxiv.org',
    'biomedcentral.com',          // all BMC journals (*.biomedcentral.com) — verified
    'journals.plos.org', 'plos.org',
    'frontiersin.org',
    'elifesciences.org',
    'peerj.com',
    'nature.com',                 // OA articles — verified
    'escholarship.org',           // UC repository — verified
    'f1000research.com', 'wellcomeopenresearch.org', 'gatesopenresearch.org',
    'dovepress.com',
    'copernicus.org',             // *.copernicus.org (ACP, ESSD, etc.)
    'mdpi-res.com',               // MDPI's asset CDN (mdpi.com itself is blocked)
    'ojs.', 'jstage.jst.go.jp', 'scielo.br', 'scielo.org',
  ];
  function isTrustedPdfHost(url?: string | null): boolean {
    if (!url) return false;
    try {
      const h = new URL(url).hostname.replace(/^www\./, '');
      return TRUSTED_PDF_HOSTS.some(t => h === t || h.endsWith('.' + t) || h.endsWith(t) || h.includes(t));
    } catch { return false; }
  }

  const mapOpenAlexWork = (w: any) => {
    const src = w.primary_location?.source || {};
    return {
      title: w.title || w.display_name || 'Untitled',
      authors: (w.authorships || []).map((a: any) => a.author?.display_name).filter(Boolean).join(', '),
      doi: w.doi || null,
      pdfUrl: w.best_oa_location?.pdf_url || w.open_access?.oa_url || null,
      journalName: src.display_name || null,
      issn: src.issn_l || (src.issn && src.issn[0]) || null,
      publisherName: src.host_organization_name || null,
      volume: w.biblio?.volume || null,
      issue: w.biblio?.issue || null,
      year: w.publication_year || null,
      subject: (w.concepts || [])[0]?.display_name || null,
      openAccess: !!w.open_access?.is_oa,
      source: 'OpenAlex',
    };
  };

  // trustedOnly=true → over-fetch via cursor and keep ONLY whitelisted-host PDFs (structure + in-app openable).
  async function fetchOpenAlex(department: string, perDept: number, trustedOnly = false) {
    const out: any[] = [];
    const perPage = 200;
    let cursor = '*';
    const maxPages = trustedOnly ? 30 : Math.max(1, Math.ceil(perDept / perPage));
    for (let page = 0; page < maxPages; page++) {
      const url = `https://api.openalex.org/works?search=${encodeURIComponent(department)}&filter=has_doi:true,open_access.is_oa:true,primary_location.source.type:journal&per-page=${perPage}&cursor=${encodeURIComponent(cursor)}`;
      const r = await fetch(url); const d: any = await r.json();
      const results = d?.results || [];
      if (!results.length) break;
      for (const w of results) {
        const m = mapOpenAlexWork(w);
        if (!m.pdfUrl) continue;
        if (trustedOnly && !isTrustedPdfHost(m.pdfUrl)) continue;
        out.push(m);
        if (out.length >= perDept) break;
      }
      if (out.length >= perDept) break;
      cursor = d?.meta?.next_cursor;
      if (!cursor) break;
    }
    return out.slice(0, perDept);
  }

  async function fetchDOAJ(department: string, perDept: number, trustedOnly = false) {
    const url = `https://doaj.org/api/search/articles/${encodeURIComponent(department)}?pageSize=${Math.min(perDept * (trustedOnly ? 5 : 1), 100)}`;
    const r = await fetch(url); const d: any = await r.json();
    const results = d?.results || [];
    const mapped = results.map((rec: any) => {
      const b = rec.bibjson || {};
      const ids = b.identifier || [];
      const issnObj = ids.find((i: any) => i.type === 'eissn') || ids.find((i: any) => i.type === 'pissn');
      const pdfLink = (b.link || []).find((l: any) => l.type === 'fulltext');
      return {
        title: b.title || 'Untitled',
        authors: (b.author || []).map((a: any) => a.name).filter(Boolean).join(', '),
        doi: (ids.find((i: any) => i.type === 'doi') || {}).id || null,
        pdfUrl: pdfLink?.url || null,
        journalName: b.journal?.title || null,
        issn: issnObj?.id || null,
        publisherName: b.journal?.publisher || null,
        volume: b.journal?.volume || null,
        issue: b.journal?.number || null,
        year: b.year ? parseInt(b.year) : null,
        subject: (b.subject || [])[0]?.term || null,
        openAccess: true,
        source: 'DOAJ',
      };
    }).filter((x: any) => x.pdfUrl || x.doi);
    return (trustedOnly ? mapped.filter((x: any) => isTrustedPdfHost(x.pdfUrl)) : mapped).slice(0, perDept);
  }

  // arXiv — direct, always-openable PDFs (no paywall / no Cloudflare). Most reliable source.
  async function fetchArxiv(department: string, perDept: number) {
    const q = encodeURIComponent(department);
    const url = `http://export.arxiv.org/api/query?search_query=all:${q}&start=0&max_results=${Math.min(perDept, 50)}&sortBy=submittedDate&sortOrder=descending`;
    const r = await fetch(url); const xml = await r.text();
    const entries = xml.split('<entry>').slice(1);
    return entries.map((e: string) => {
      const get = (tag: string) => { const m = e.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return m ? m[1].replace(/\s+/g, ' ').trim() : ''; };
      const arxivId = ((get('id').split('/abs/')[1]) || '').replace(/v\d+$/, '');
      const published = get('published');
      return {
        title: get('title') || 'Untitled',
        authors: [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m: any) => m[1].trim()).join(', '),
        doi: get('arxiv:doi') || null,
        pdfUrl: arxivId ? `https://arxiv.org/pdf/${arxivId}` : null,
        journalName: get('arxiv:journal_ref') || 'arXiv',
        issn: null, publisherName: 'arXiv', volume: null, issue: null,
        year: published ? parseInt(published.slice(0, 4)) : null,
        subject: null, openAccess: true, source: 'arXiv',
      };
    }).filter((a: any) => a.pdfUrl);
  }

  // Verify a PDF URL actually opens (real PDF, not a landing page / Cloudflare block / 404).
  const PDF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  async function isFetchablePdf(url: string | null): Promise<boolean> {
    if (!url) return false;
    try {
      const nodeFetch = (await import('node-fetch')).default;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res: any = await nodeFetch(url, {
        method: 'GET',
        headers: { 'User-Agent': PDF_UA, 'Accept': 'application/pdf,*/*', 'Range': 'bytes=0-2047' },
        redirect: 'follow', signal: ctrl.signal as any,
      });
      clearTimeout(timer);
      if (res.status >= 400) return false;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('application/pdf')) return true;
      if (ct.includes('text/html')) return false;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.slice(0, 5).toString('latin1').startsWith('%PDF');
    } catch { return false; }
  }

  // Europe PMC — full journal structure (journal, ISSN, volume, issue) + OA articles.
  async function fetchEuropePMC(department: string, perDept: number) {
    const q = encodeURIComponent(`${department} AND OPEN_ACCESS:Y`);
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&format=json&pageSize=${Math.min(perDept, 50)}&resultType=core`;
    const r = await fetch(url); const d: any = await r.json();
    const results = d?.resultList?.result || [];
    return results.map((x: any) => {
      const ji = x.journalInfo || {}; const j = ji.journal || {};
      const urls = x.fullTextUrlList?.fullTextUrl || [];
      const pdf = urls.find((u: any) => u.documentStyle === 'pdf');
      const html = urls.find((u: any) => u.documentStyle === 'html');
      const readUrl = pdf?.url || html?.url || (x.pmcid ? `https://europepmc.org/article/PMC/${x.pmcid}` : (x.doi ? `https://doi.org/${x.doi}` : null));
      return {
        title: x.title || 'Untitled',
        authors: x.authorString || null,
        doi: x.doi || null,
        pdfUrl: readUrl,
        journalName: j.title || null,
        issn: j.issn || j.essn || null,
        publisherName: null,
        volume: ji.volume || null, issue: ji.issue || null,
        year: ji.yearOfPublication ? parseInt(ji.yearOfPublication) : (x.pubYear ? parseInt(x.pubYear) : null),
        subject: null, openAccess: true, source: 'EuropePMC',
      };
    }).filter((a: any) => a.title && a.pdfUrl);
  }

  const fetchForDept = (source: string, dept: string, limit: number, trustedOnly = false) =>
    source === 'doaj' ? fetchDOAJ(dept, limit, trustedOnly)
      : source === 'arxiv' ? fetchArxiv(dept, limit)
        : source === 'europepmc' ? fetchEuropePMC(dept, limit)
          : fetchOpenAlex(dept, limit, trustedOnly);

  // Validate a batch of candidate PDFs in parallel (bounded concurrency) → returns only the openable ones.
  async function keepOpenable(items: any[], concurrency = 12): Promise<{ kept: any[]; skipped: number }> {
    const kept: any[] = []; let skipped = 0;
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const oks = await Promise.all(batch.map(it => isFetchablePdf(it.pdfUrl)));
      batch.forEach((it, j) => oks[j] ? kept.push(it) : skipped++);
    }
    return { kept, skipped };
  }

  // Preview (dry run) — fetch & map, NO insert (frontend can export CSV from this)
  app.post("/api/admin/ingest/preview", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const { source = 'openalex', departments = [], perDept = 10 } = req.body;
      if (!Array.isArray(departments) || !departments.length) return res.status(400).json({ error: "Select at least one department" });
      const trustedOnly = req.body.trustedHostsOnly !== false && (source === 'openalex' || source === 'doaj');
      const limit = Math.min(Math.max(parseInt(perDept) || 10, 1), 50);
      const items: any[] = [];
      for (const dept of departments) {
        try { const got = await fetchForDept(source, dept, limit, trustedOnly); items.push(...got.map((x: any) => ({ ...x, department: dept }))); }
        catch (e) { console.error(`Preview fetch [${source}/${dept}]`, e); }
      }
      res.json({ source, trustedOnly, count: items.length, items });
    } catch (e: any) { console.error("Ingest preview error:", e); res.status(500).json({ error: "Preview failed" }); }
  });

  // Background ingestion jobs (in-memory). Admin bulk ingest is re-runnable + dedup-skips,
  // so losing job state on redeploy is harmless. Large runs must NOT block the HTTP request.
  const ingestJobs = new Map<string, any>();

  async function processIngestJob(job: any, req: any) {
    const { source, departments, limit, validate, trustedOnly } = job.params;
    const publishersTouched = new Set<string>();
    try {
      for (const dept of departments) {
        job.currentDept = dept;
        let items: any[] = [];
        try { items = await fetchForDept(source, dept, limit, trustedOnly); }
        catch (e) { console.error(`Ingest fetch [${source}/${dept}]`, e); continue; }
        job.fetched += items.length;

        // Confirm each candidate actually opens (parallel — trusted-host filter means no slow hangs).
        if (validate) {
          const { kept, skipped } = await keepOpenable(items);
          job.skippedUnopenable += skipped;
          items = kept;
        }

        for (const it of items) {
          try {
            const fp = articleFingerprint(it.doi, it.title, it.authors);
            const exists = await (prisma as any).article.findUnique({ where: { fingerprint: fp } });
            if (exists) { job.duplicates++; continue; }

            const publisher = await upsertPublisherByName(it.publisherName, it.source);
            if (publisher) publishersTouched.add(publisher.id);
            const journal = await upsertJournalByIssn(it.issn, {
              title: it.journalName || 'Unknown Journal',
              publisherId: publisher?.id || null, publisherName: it.publisherName || null,
              domain: dept, subject: it.subject || null, openAccess: !!it.openAccess, startYear: it.year || null,
            });

            await (prisma as any).article.create({
              data: {
                title: it.title, authors: it.authors || null, doi: it.doi || null, pdfUrl: it.pdfUrl || null,
                journalId: journal?.id || null, journalName: it.journalName || null, journalIssn: it.issn || null,
                publisherId: publisher?.id || null, publisherName: it.publisherName || null,
                volume: it.volume ? String(it.volume) : null, issue: it.issue ? String(it.issue) : null,
                year: it.year || null, domain: dept, subject: it.subject || null,
                accessType: 'OpenAccess', status: 'Published', source: it.source, fingerprint: fp,
                createdBy: req.user?.email || 'Ingestion',
              }
            });
            job.inserted++;
          } catch (e) { job.failed++; }
        }
      }
      job.publishersDiscovered = publishersTouched.size;
      job.status = 'done';
    } catch (e: any) {
      console.error("Ingest job error:", e);
      job.status = 'error'; job.error = e?.message || 'Ingestion failed';
    } finally {
      job.currentDept = null; job.finishedAt = Date.now();
    }
  }

  // Run — starts a background job, returns jobId immediately (poll /ingest/status/:id for live progress)
  // ── Continuous ingestion ────────────────────────────────────────────────
  // Switched on once and left alone. The timer does one small slice per tick and
  // records where it reached, so a restart costs at most a single slice — which
  // is the difference between "leave it running" and "babysit a four-hour job".

  const ALL_DEPARTMENTS = DOMAINS.map((d: any) => d.name);

  app.get("/api/admin/ingest/state", authenticateJWT, requireSuperAdmin, async (_req: any, res: any) => {
    try { res.json(await getIngestionState()); }
    catch { res.status(500).json({ error: "Failed to read ingestion state" }); }
  });

  app.post("/api/admin/ingest/state", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const { enabled, yearsBack, departments, batchSize } = req.body || {};
      const data: any = {};
      if (typeof enabled === 'boolean') data.enabled = enabled;
      if (Number.isInteger(yearsBack) && yearsBack > 0 && yearsBack <= 50) data.yearsBack = yearsBack;
      if (Array.isArray(departments)) data.departments = departments;
      if (Number.isInteger(batchSize) && batchSize > 0 && batchSize <= 200) data.batchSize = batchSize;
      await getIngestionState();
      res.json(await (prisma as any).ingestionState.update({ where: { id: 'singleton' }, data }));
    } catch { res.status(500).json({ error: "Failed to update ingestion state" }); }
  });

  /** Run one slice now, so the switch can be tested without waiting for the timer. */
  app.post("/api/admin/ingest/tick", authenticateJWT, requireSuperAdmin, async (_req: any, res: any) => {
    try { res.json(await runIngestionPass(ALL_DEPARTMENTS)); }
    catch (e: any) { res.status(500).json({ error: String(e?.message || e) }); }
  });

  // The timer. One slice a minute is deliberately unhurried: it stays well
  // inside the API's polite limits and never competes with live traffic.
  let ingestBusy = false;
  setInterval(async () => {
    if (ingestBusy) return;
    ingestBusy = true;
    try { await runIngestionPass(ALL_DEPARTMENTS); }
    catch (e) { console.error('[ingest] pass failed:', e); }
    finally { ingestBusy = false; }
  }, 60_000);

  app.post("/api/admin/ingest/run", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const { source = 'openalex', departments = [], perDept = 25 } = req.body;
      if (!Array.isArray(departments) || !departments.length) return res.status(400).json({ error: "Select at least one department" });
      const limit = Math.min(Math.max(parseInt(perDept) || 25, 1), 300);
      const validate = req.body.validatePdf !== false; // default ON — only ingest PDFs that open in-app
      const trustedOnly = req.body.trustedHostsOnly !== false && (source === 'openalex' || source === 'doaj');
      const jobId = `ing_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const job: any = {
        id: jobId, status: 'running', startedAt: Date.now(), finishedAt: null, currentDept: null,
        params: { source, departments, limit, validate, trustedOnly },
        source, trustedOnly, departments, totalDepts: departments.length,
        fetched: 0, inserted: 0, duplicates: 0, failed: 0, skippedUnopenable: 0, publishersDiscovered: 0,
      };
      ingestJobs.set(jobId, job);
      // fire-and-forget; do not await
      processIngestJob(job, req).finally(() => {
        // keep finished jobs for 30 min so the UI can read the final summary, then GC
        setTimeout(() => ingestJobs.delete(jobId), 30 * 60 * 1000);
      });
      res.json({ started: true, jobId, ...jobSummary(job) });
    } catch (e: any) { console.error("Ingest run error:", e); res.status(500).json({ error: "Ingestion failed" }); }
  });

  const jobSummary = (job: any) => ({
    jobId: job.id, status: job.status, source: job.source, trustedOnly: job.trustedOnly,
    departments: job.departments, totalDepts: job.totalDepts, currentDept: job.currentDept,
    fetched: job.fetched, inserted: job.inserted, duplicates: job.duplicates, failed: job.failed,
    skippedUnopenable: job.skippedUnopenable, publishersDiscovered: job.publishersDiscovered,
    error: job.error || null,
  });

  // Status — poll for live progress of a running/finished ingest job
  app.get("/api/admin/ingest/status/:jobId", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    const job = ingestJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found (may have finished & expired)" });
    res.json(jobSummary(job));
  });

  // ==========================================
  // PUBLIC LIBRARY BROWSE — NEW structured dataset (published only)
  // Cascading filters: department -> journal -> year -> volume -> issue -> article
  // ==========================================

  // Resolve the departments a request is allowed to see. null = all (admin or no user); [] = none.
  const libraryScopeDomains = async (req: any): Promise<string[] | null> => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    let ud: any = null;
    try { ud = jwt.verify(authHeader.split(' ')[1], JWT_SECRET); } catch { return null; }
    if (['SuperAdmin', 'Admin', 'ContentManager'].includes(ud.role)) return null;
    const subs = await getUserActiveSubscriptions(ud.uid, ud.role, ud.institutionId);
    const domains = new Set<string>();
    for (const s of subs) {
      const d = Array.isArray(s.domains) ? s.domains : (s.domains ? JSON.parse(s.domains as string) : []);
      d.forEach((x: string) => x && domains.add(x));
      if (s.domainName) domains.add(s.domainName);
    }
    return [...domains];
  };
  const applyDomainScope = (where: any, requestedDomain: string | undefined, scope: string[] | null) => {
    if (scope === null) { if (requestedDomain) where.domain = requestedDomain; return; }
    const allowed = scope.length ? scope : ['__no_access__'];
    if (requestedDomain) where.domain = allowed.includes(requestedDomain) ? requestedDomain : '__no_access__';
    else where.domain = { in: allowed };
  };

  // Distinct publishers that actually have published articles the user can see (domain-scoped)
  app.get("/api/library/publishers", async (req: any, res: any) => {
    try {
      const { domain } = req.query;
      const where: any = { status: 'Published' };
      applyDomainScope(where, domain, await libraryScopeDomains(req));
      const groups = await (prisma as any).article.groupBy({ by: ['publisherName'], where, _count: { _all: true } });
      const list = groups
        .filter((g: any) => g.publisherName)
        .map((g: any) => ({ name: g.publisherName, count: g._count._all }))
        .sort((a: any, b: any) => b.count - a.count);
      res.json(list);
    } catch (e: any) { console.error("library publishers:", e); res.status(500).json({ error: "Failed to load publishers" }); }
  });

  app.get("/api/library/journals", async (req: any, res: any) => {
    try {
      const { domain, recentYears, search, publisher } = req.query;
      const where: any = {};
      applyDomainScope(where, domain, await libraryScopeDomains(req));
      if (recentYears) { where.startYear = { gte: new Date().getFullYear() - (parseInt(recentYears as string) || 0) }; }
      if (publisher) where.publisherName = publisher;
      if (search) where.title = { contains: search as string, mode: 'insensitive' };
      const journals = await (prisma as any).journal.findMany({ where, orderBy: { title: 'asc' }, take: 500 });
      // One grouped count for the whole page. Counting per journal in a Promise.all
      // meant up to 500 concurrent queries, which exhausted the connection pool and
      // 500'd this endpoint (the /explore journals sidebar came back empty).
      const groups = journals.length
        ? await (prisma as any).article.groupBy({
          by: ['journalId'],
          where: { status: 'Published', journalId: { in: journals.map((j: any) => j.id) } },
          _count: { _all: true },
        })
        : [];
      const countBy = new Map(groups.map((g: any) => [g.journalId, g._count._all]));
      const withCounts = journals.map((j: any) => ({
        id: j.id, title: j.title, issn: j.issn, publisherName: j.publisherName, domain: j.domain, startYear: j.startYear,
        articleCount: countBy.get(j.id) || 0,
      }));
      res.json(withCounts.filter((j: any) => j.articleCount > 0));
    } catch (e: any) { console.error("library journals:", e); res.status(500).json({ error: "Failed to load journals" }); }
  });

  app.get("/api/library/facets", async (req: any, res: any) => {
    try {
      const { journalId, journalIds, year, volume } = req.query;
      const base: any = { status: 'Published' };
      const jidList = journalIds ? String(journalIds).split(',').filter(Boolean) : [];
      if (jidList.length) base.journalId = { in: jidList };
      else if (journalId) base.journalId = journalId;
      const years = await (prisma as any).article.findMany({ where: base, distinct: ['year'], select: { year: true }, orderBy: { year: 'desc' } });
      const volWhere: any = { ...base }; if (year) volWhere.year = parseInt(year as string);
      const volumes = await (prisma as any).article.findMany({ where: volWhere, distinct: ['volume'], select: { volume: true } });
      const issWhere: any = { ...volWhere }; if (volume) issWhere.volume = String(volume);
      const issues = await (prisma as any).article.findMany({ where: issWhere, distinct: ['issue'], select: { issue: true } });
      res.json({
        years: years.map((y: any) => y.year).filter((v: any) => v != null),
        volumes: volumes.map((v: any) => v.volume).filter(Boolean),
        issues: issues.map((i: any) => i.issue).filter(Boolean),
      });
    } catch (e: any) { res.status(500).json({ error: "Failed to load facets" }); }
  });

  // Sorting a result set is the server's job. Ordering the twenty rows already
  // sent meant page two started the ordering again.
  const orderFor = (sort: any): any[] => {
    if (sort === 'oldest') return [{ year: 'asc' }, { createdAt: 'asc' }];
    if (sort === 'title') return [{ title: 'asc' }];
    return [{ year: 'desc' }, { createdAt: 'desc' }];
  };

  app.get("/api/library/articles", async (req: any, res: any) => {
    try {
      const { domain, journalId, journalIds, journalIssn, publisher, year, volume, issue, search, oa, sort, page = '1', limit = '20' } = req.query;
      const where: any = { status: 'Published' };
      applyDomainScope(where, domain, await libraryScopeDomains(req));
      const jidList = journalIds ? String(journalIds).split(',').filter(Boolean) : [];
      if (jidList.length) where.journalId = { in: jidList };
      else if (journalId) where.journalId = journalId;
      if (journalIssn) where.journalIssn = journalIssn;
      if (publisher) where.publisherName = publisher;
      if (year) where.year = parseInt(year as string);
      if (volume) where.volume = String(volume);
      if (issue) where.issue = String(issue);
      if (search) where.OR = [{ title: { contains: search as string, mode: 'insensitive' } }, { authors: { contains: search as string, mode: 'insensitive' } }];
      // Open access narrowed the page the client had already been given, so a
      // page of twelve could show three while the header still claimed 27,056.
      // It belongs in the query, with the count.
      if (oa === '1') where.accessType = { in: ['OpenAccess', 'Free'] };
      const take = Math.min(parseInt(limit as string) || 20, 100);
      const skip = ((parseInt(page as string) || 1) - 1) * take;
      // Join the journal so the metadata popup can show ISSN/eISSN even when the
      // denormalized copy on the article is missing (older ingests didn't set it).
      const [data, total] = await Promise.all([
        (prisma as any).article.findMany({
          where, orderBy: orderFor(sort), skip, take,
          include: { journal: { select: { title: true, issn: true, eissn: true, subject: true, publisherName: true } } },
        }),
        (prisma as any).article.count({ where }),
      ]);
      res.json({ data, total, page: parseInt(page as string) || 1, limit: take });
    } catch (e: any) { console.error("library articles:", e); res.status(500).json({ error: "Failed to load articles" }); }
  });

  // ── The shelf ───────────────────────────────────────────────────────────
  // One journal, its run of volumes, and what sits inside an issue. This is the
  // back-run a reader expects to find beside whatever they are reading, and it
  // is grouped from fields the articles already carry rather than stored twice.

  app.get("/api/library/journal/:issn", async (req: any, res: any) => {
    try {
      const key = decodeURIComponent(req.params.issn);
      // Accept whichever spelling the caller has; ours are stored inconsistently.
      const norm = normaliseIssn(key);
      const journal = await (prisma as any).journal.findFirst({
        where: { OR: [{ issn: key }, { eissn: key }, { id: key },
                      ...(norm ? [{ issn: norm }, { eissn: norm }] : [])] },
      });
      if (!journal) return res.status(404).json({ error: "Journal not found" });

      // Respect what the reader is entitled to see, exactly as the lists do.
      const scope = await libraryScopeDomains(req);
      if (scope !== null && journal.domain && !scope.includes(journal.domain)) {
        return res.status(403).json({ error: "Not in your subscription" });
      }

      const volumes = await (prisma as any).$queryRawUnsafe(`
        select volume, max(year)::int as year,
               count(distinct issue)::int as issues, count(*)::int as articles
        from "Article"
        where "journalId" = $1 and status = 'Published' and volume is not null
        group by volume order by max(year) desc nulls last, volume desc`, journal.id);

      res.json({ ...journal, volumes });
    } catch (e: any) {
      console.error('GET library/journal error:', e?.message);
      res.status(500).json({ error: "Failed to load journal" });
    }
  });

  app.get("/api/library/journal/:issn/volume/:volume", async (req: any, res: any) => {
    try {
      const key = decodeURIComponent(req.params.issn);
      const volume = decodeURIComponent(req.params.volume);
      const norm = normaliseIssn(key);
      const journal = await (prisma as any).journal.findFirst({
        where: { OR: [{ issn: key }, { eissn: key }, { id: key },
                      ...(norm ? [{ issn: norm }, { eissn: norm }] : [])] },
        select: { id: true, title: true, domain: true, issn: true, licence: true },
      });
      if (!journal) return res.status(404).json({ error: "Journal not found" });

      const scope = await libraryScopeDomains(req);
      if (scope !== null && journal.domain && !scope.includes(journal.domain)) {
        return res.status(403).json({ error: "Not in your subscription" });
      }

      const articles = await (prisma as any).article.findMany({
        where: { journalId: journal.id, volume, status: 'Published' },
        select: {
          id: true, title: true, authors: true, issue: true, year: true, pages: true,
          doi: true, accessStatus: true, licence: true, originalUrl: true, pdfUrl: true,
        },
        orderBy: [{ issue: 'asc' }, { title: 'asc' }],
        take: 500,
      });

      // Group into issues, the way an issue actually reads.
      const issues: Record<string, any[]> = {};
      for (const a of articles) {
        const k = a.issue || '—';
        (issues[k] = issues[k] || []).push(a);
      }
      res.json({
        journal, volume,
        issues: Object.entries(issues).map(([issue, items]) => ({ issue, articles: items })),
      });
    } catch (e: any) {
      console.error('GET library/volume error:', e?.message);
      res.status(500).json({ error: "Failed to load volume" });
    }
  });

  // ── People ──────────────────────────────────────────────────────────────

  app.get("/api/library/author/:id", async (req: any, res: any) => {
    try {
      const author = await (prisma as any).author.findUnique({ where: { id: req.params.id } });
      if (!author) return res.status(404).json({ error: "Author not found" });

      const links = await (prisma as any).articleAuthor.findMany({
        where: { authorId: author.id },
        select: { position: true, article: { select: {
          id: true, title: true, year: true, journalName: true, journalIssn: true,
          domain: true, accessStatus: true, doi: true, originalUrl: true,
        } } },
        take: 500,
      });

      const articles = links
        .map((l: any) => ({ ...l.article, position: l.position }))
        .filter((a: any) => a)
        .sort((a: any, b: any) => (b.year || 0) - (a.year || 0));

      // Where this person publishes, and in which subjects — the two things that
      // make an author page worth opening rather than just a list.
      const byJournal = new Map<string, number>();
      const byDomain = new Map<string, number>();
      for (const a of articles) {
        if (a.journalName) byJournal.set(a.journalName, (byJournal.get(a.journalName) || 0) + 1);
        if (a.domain) byDomain.set(a.domain, (byDomain.get(a.domain) || 0) + 1);
      }
      const top = (m: Map<string, number>) =>
        [...m.entries()].sort((x, y) => y[1] - x[1]).map(([name, count]) => ({ name, count }));

      res.json({ ...author, articles, journals: top(byJournal), domains: top(byDomain) });
    } catch (e: any) {
      console.error('GET library/author error:', e?.message);
      res.status(500).json({ error: "Failed to load author" });
    }
  });

  /**
   * One article, with everything that surrounds it.
   *
   * The viewer is a reading surface — zoom, progress, fullscreen — and putting
   * bibliographic context inside it would clutter the reading. This is the
   * record page instead: who wrote it, what it appeared in, and what sits beside
   * it on the shelf. It also carries the source and rights the external audit
   * asks every record to show.
   */
  app.get("/api/library/article/:id", async (req: any, res: any) => {
    try {
      const article = await (prisma as any).article.findUnique({
        where: { id: req.params.id },
        include: {
          journal: { select: {
            id: true, title: true, issn: true, publisherName: true, domain: true,
            licence: true, licenceIsNC: true, firstYear: true, lastYear: true, volumeCount: true,
          } },
          authorLinks: {
            select: { position: true, author: { select: { id: true, name: true, identitySource: true, articleCount: true } } },
            orderBy: { position: 'asc' },
          },
        },
      });
      if (!article) return res.status(404).json({ error: "Article not found" });

      const scope = await libraryScopeDomains(req);
      if (scope !== null && article.domain && !scope.includes(article.domain)) {
        return res.status(403).json({ error: "Not in your subscription" });
      }

      // The rest of the issue — the other papers on the same rack.
      const siblings = article.journalId && article.volume ? await (prisma as any).article.findMany({
        where: {
          journalId: article.journalId, volume: article.volume, issue: article.issue,
          status: 'Published', NOT: { id: article.id },
        },
        select: { id: true, title: true, authors: true, pages: true },
        take: 30,
      }) : [];

      res.json({
        ...article,
        authors_structured: article.authorLinks.map((l: any) => ({ ...l.author, position: l.position })),
        authorLinks: undefined,
        siblings,
      });
    } catch (e: any) {
      console.error('GET library/article error:', e?.message);
      res.status(500).json({ error: "Failed to load article" });
    }
  });

  // GET /api/library/content/:id — the record behind a legacy item, so the
  // reader's rail is not empty for the 9,024 rows that predate the catalogue.
  // publishedAt is deliberately absent: it defaults to now(), so every one of
  // these rows would claim to have been published today.
  app.get("/api/library/content/:id", authenticateJWT, async (req: any, res: any) => {
    try {
      const c = await prisma.content.findFirst({
        where: { id: req.params.id, status: { not: 'Draft' } },
        select: {
          id: true, title: true, description: true, authors: true, domain: true,
          contentType: true, subjectArea: true, tags: true, views: true,
        },
      });
      if (!c) return res.status(404).json({ error: "Record not found" });

      const scope = await libraryScopeDomains(req);
      if (scope !== null && c.domain && !scope.includes(c.domain)) {
        return res.status(403).json({ error: "Not in your subscription" });
      }

      // Its neighbours on the same shelf. Matching the content type as well as
      // the department is what makes this a shelf rather than a random draw —
      // a thesis sits beside other theses. Most-read first, since these rows
      // carry no reliable date to order by.
      const related = await prisma.content.findMany({
        where: {
          id: { not: c.id },
          status: { not: 'Draft' },
          domain: c.domain || undefined,
          contentType: c.contentType,
        },
        select: { id: true, title: true, authors: true },
        orderBy: { views: 'desc' },
        take: 12,
      });

      const relatedLabel = `More ${String(c.contentType || 'items').toLowerCase()} in ${c.domain || 'this department'}`;
      res.json({ ...c, related, relatedLabel });
    } catch (e) {
      res.status(500).json({ error: "Failed to load record" });
    }
  });

  // GET /api/library/department/:slug — a department as a shelf of journals.
  // The department was reachable only as a marketing landing page; this is its
  // catalogue entry, so "Nursing" in a breadcrumb opens what we actually hold.
  const departmentSlug = (d: string) => d.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  app.get("/api/library/department/:slug", async (req: any, res: any) => {
    try {
      const wanted = String(req.params.slug || '').toLowerCase();

      // Resolve the slug against the departments we actually hold journals in,
      // so a renamed or unheld department 404s rather than showing an empty shelf.
      const domains: { domain: string }[] = await (prisma as any).journal.findMany({
        where: { domain: { not: null }, articleCount: { gt: 0 } },
        select: { domain: true }, distinct: ['domain'],
      });
      const match = domains.find(d => departmentSlug(d.domain) === wanted);
      if (!match) return res.status(404).json({ error: "Department not found" });
      const domain = match.domain;

      const scope = await libraryScopeDomains(req);
      if (scope !== null && !scope.includes(domain)) {
        return res.status(403).json({ error: "Not in your subscription" });
      }

      const [journals, articles, books, publishers] = await Promise.all([
        (prisma as any).journal.findMany({
          where: { domain, articleCount: { gt: 0 } },
          select: {
            id: true, title: true, issn: true, publisherName: true, licence: true, licenceIsNC: true,
            articleCount: true, volumeCount: true, issueCount: true, firstYear: true, lastYear: true,
          },
          orderBy: { articleCount: 'desc' },
        }),
        (prisma as any).article.count({ where: { domain, status: 'Published' } }),
        (prisma as any).book.count({ where: { domain, status: 'Published' } }),
        (prisma as any).journal.groupBy({
          by: ['publisherName'],
          where: { domain, articleCount: { gt: 0 }, publisherName: { not: null } },
          _count: { _all: true },
        }),
      ]);

      const years = journals.flatMap((j: any) => [j.firstYear, j.lastYear]).filter(Boolean) as number[];

      res.json({
        domain,
        slug: wanted,
        journals,
        articles,
        books,
        firstYear: years.length ? Math.min(...years) : null,
        lastYear: years.length ? Math.max(...years) : null,
        publishers: publishers
          .map((p: any) => ({ name: p.publisherName, journals: p._count._all }))
          .sort((a: any, b: any) => b.journals - a.journals),
      });
    } catch (e: any) {
      console.error('GET library/department error:', e?.message);
      res.status(500).json({ error: "Failed to load department" });
    }
  });

  // GET /api/library/publisher/:slug — a publisher, and the journals of theirs
  // we hold. Publisher names appear on every result row and journal spine; this
  // is what makes them doors rather than plain text.
  app.get("/api/library/publisher/:slug", async (req: any, res: any) => {
    try {
      const wanted = String(req.params.slug || '').toLowerCase();

      const names: { publisherName: string }[] = await (prisma as any).journal.findMany({
        where: { publisherName: { not: null }, articleCount: { gt: 0 } },
        select: { publisherName: true }, distinct: ['publisherName'],
      });
      const match = names.find(n => departmentSlug(n.publisherName) === wanted);
      if (!match) return res.status(404).json({ error: "Publisher not found" });
      const publisherName = match.publisherName;

      const scope = await libraryScopeDomains(req);
      const where: any = { publisherName, articleCount: { gt: 0 } };
      if (scope !== null) where.domain = { in: scope };

      const journals = await (prisma as any).journal.findMany({
        where,
        select: {
          id: true, title: true, issn: true, domain: true, licence: true, licenceIsNC: true,
          articleCount: true, volumeCount: true, issueCount: true, firstYear: true, lastYear: true,
        },
        orderBy: { articleCount: 'desc' },
      });

      // A publisher the reader's subscription reaches none of is not an error —
      // it is simply empty for them, and the page says so.
      const years = journals.flatMap((j: any) => [j.firstYear, j.lastYear]).filter(Boolean) as number[];
      const byDomain = new Map<string, number>();
      for (const j of journals) if (j.domain) byDomain.set(j.domain, (byDomain.get(j.domain) || 0) + 1);

      res.json({
        publisherName,
        slug: wanted,
        journals,
        articles: journals.reduce((n: number, j: any) => n + (j.articleCount || 0), 0),
        firstYear: years.length ? Math.min(...years) : null,
        lastYear: years.length ? Math.max(...years) : null,
        departments: [...byDomain.entries()]
          .map(([name, journals]) => ({ name, journals }))
          .sort((a, b) => b.journals - a.journals),
      });
    } catch (e: any) {
      console.error('GET library/publisher error:', e?.message);
      res.status(500).json({ error: "Failed to load publisher" });
    }
  });

  // ── One query behind every count on the site ────────────────────────────
  // The homepage figure and the department figure have to agree, which they
  // cannot if each screen counts for itself.
  app.get("/api/library/stats", async (_req: any, res: any) => {
    try {
      const [journals, byDomain, articles, books, authors] = await Promise.all([
        (prisma as any).journal.count({ where: { articleCount: { gt: 0 } } }),
        (prisma as any).$queryRawUnsafe(`
          select domain,
                 count(*)::int as journals,
                 coalesce(sum("articleCount"),0)::int as articles,
                 min("firstYear") as from_year, max("lastYear") as to_year
          from "Journal" where domain is not null and "articleCount" > 0
          group by domain order by journals desc`),
        (prisma as any).article.count({ where: { status: 'Published' } }),
        (prisma as any).book.count({ where: { status: 'Published' } }),
        (prisma as any).author.count(),
      ]);
      res.json({ journals, articles, books, authors, departments: byDomain });
    } catch (e: any) {
      console.error('GET library/stats error:', e?.message);
      res.status(500).json({ error: "Failed to load stats" });
    }
  });

  app.get("/api/library/books", async (req: any, res: any) => {
    try {
      const { domain, search, oa, sort, page = '1', limit = '20' } = req.query;
      const where: any = { status: 'Published' };
      applyDomainScope(where, domain, await libraryScopeDomains(req));
      if (search) where.title = { contains: search as string, mode: 'insensitive' };
      if (oa === '1') where.accessType = { in: ['OpenAccess', 'Free'] };
      const take = Math.min(parseInt(limit as string) || 20, 100);
      const skip = ((parseInt(page as string) || 1) - 1) * take;
      const [data, total] = await Promise.all([
        (prisma as any).book.findMany({ where, orderBy: orderFor(sort), skip, take, include: { chapters: true } }),
        (prisma as any).book.count({ where }),
      ]);
      res.json({ data, total, page: parseInt(page as string) || 1, limit: take });
    } catch (e: any) { res.status(500).json({ error: "Failed to load books" }); }
  });

  // ==========================================
  // ADMIN: NEW STRUCTURED DATASET CRUD (Article/Book) — per content type
  // kind = 'book' for Books, 'article' for all other content types
  // ==========================================

  const kindFor = (contentType: string) => (contentType === 'Books' ? 'book' : 'article');

  const buildAdminArticle = (b: any, createdBy: string) => ({
    contentType: b.contentType || 'Periodicals',
    title: b.title || 'Untitled',
    authors: b.authors || null,
    abstract: b.description || null,
    doi: b.doi || null,
    pdfUrl: b.fileUrl || b.pdfUrl || null,
    journalName: b.journalName || null,
    journalIssn: b.journalIssn || b.issn || null,
    publisherName: b.publisherName || null,
    volume: b.volume ? String(b.volume) : null,
    issue: b.issue ? String(b.issue) : null,
    year: b.year ? parseInt(b.year) : null,
    pages: b.pages || null,
    domain: b.domain || null,
    subject: b.subjectArea || b.subject || null,
    accessType: b.accessType || 'OpenAccess',
    status: b.status || 'Published',
    source: 'Admin',
    ownershipSource: 'AdminEntered',
    createdBy,
    metadata: { ...(b.metadata || {}), tags: b.tags || [], thumbnailUrl: b.thumbnailUrl || null },
  });

  const buildAdminBook = (b: any, createdBy: string) => ({
    title: b.title || 'Untitled',
    authors: b.authors || null,
    publisherName: b.publisherName || null,
    isbn: b.isbn || null,
    doi: b.doi || null,
    year: b.year ? parseInt(b.year) : null,
    edition: b.edition || null,
    pages: b.pages || null,
    subject: b.subjectArea || b.subject || null,
    domain: b.domain || null,
    description: b.description || null,
    coverUrl: b.thumbnailUrl || null,
    pdfUrl: b.fileUrl || b.pdfUrl || null,
    accessType: b.accessType || 'OpenAccess',
    status: b.status || 'Published',
    source: 'Admin',
    ownershipSource: 'AdminEntered',
    createdBy,
    metadata: { ...(b.metadata || {}), tags: b.tags || [] },
  });

  // Present an Article/Book row with legacy-compatible aliases for the list UI
  const aliasItem = (row: any) => ({
    ...row,
    fileUrl: row.pdfUrl || row.fileUrl || null,
    thumbnailUrl: row.coverUrl || row.metadata?.thumbnailUrl || null,
    publishedAt: row.createdAt,
  });

  app.get("/api/admin/library/items", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const { contentType, search, domain, status, page = '1', limit = '15' } = req.query;
      const kind = kindFor(contentType);
      const take = Math.min(parseInt(limit as string) || 15, 100000);
      const skip = ((parseInt(page as string) || 1) - 1) * take;
      const where: any = {};
      if (kind === 'article') where.contentType = contentType;
      if (domain) where.domain = domain;
      if (status) where.status = status;
      if (search) where.OR = [{ title: { contains: search as string, mode: 'insensitive' } }, { authors: { contains: search as string, mode: 'insensitive' } }];
      const model = (prisma as any)[kind];
      const [rows, total] = await Promise.all([
        model.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        model.count({ where }),
      ]);
      res.json({ data: rows.map(aliasItem), total, page: parseInt(page as string) || 1, limit: take });
    } catch (e: any) { console.error("admin library list:", e); res.status(500).json({ error: "Failed to load items" }); }
  });

  app.get("/api/admin/library/items/:kind/:id", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const kind = req.params.kind === 'book' ? 'book' : 'article';
      const row = await (prisma as any)[kind].findUnique({ where: { id: req.params.id }, ...(kind === 'book' ? { include: { chapters: true } } : {}) });
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(aliasItem(row));
    } catch (e: any) { res.status(500).json({ error: "Failed to load item" }); }
  });

  app.post("/api/admin/library/items", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const by = req.user?.email || 'Admin';
      const kind = kindFor(req.body.contentType);
      if (kind === 'book') {
        const chapters = Array.isArray(req.body.chapters) ? req.body.chapters.filter((c: any) => c && c.title) : [];
        const book = await (prisma as any).book.create({
          data: {
            ...buildAdminBook(req.body, by),
            chapters: chapters.length ? { create: chapters.map((c: any, i: number) => ({ title: c.title, authors: c.authors || null, pdfUrl: c.pdfUrl || null, pages: c.pages || null, chapterNumber: c.chapterNumber ? parseInt(c.chapterNumber) : (i + 1), status: req.body.status || 'Published' })) } : undefined,
          },
        });
        return res.json(book);
      }
      const data = buildAdminArticle(req.body, by);
      // Link/create Publisher + Journal so the item is filterable in /explore (same as ingestion)
      const publisher = await upsertPublisherByName(data.publisherName, 'Admin');
      const journal = await upsertJournalByIssn(data.journalIssn, {
        title: data.journalName || 'Unknown Journal',
        publisherId: publisher?.id || null, publisherName: data.publisherName || null,
        domain: data.domain, subject: data.subject, openAccess: data.accessType === 'OpenAccess', startYear: data.year || null,
      });
      const article = await (prisma as any).article.create({ data: { ...data, publisherId: publisher?.id || null, journalId: journal?.id || null } });
      res.json(article);
    } catch (e: any) { console.error("admin library create:", e); res.status(500).json({ error: "Failed to create item" }); }
  });

  // Bulk import into the NEW structured dataset (Article/Book) — mirrors the single create above.
  app.post("/api/admin/library/items/bulk", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const by = req.user?.email || 'Admin';
      const kind = kindFor(req.body.contentType);
      const rows: any[] = Array.isArray(req.body.items) ? req.body.items : [];
      if (!rows.length) return res.status(400).json({ error: "No rows to import" });
      let success = 0, failed = 0; const errors: any[] = [];
      // Cache within the request: OJS-style feeds have thousands of articles per
      // journal/publisher — avoid re-querying the same ones on every row.
      const pubCache = new Map<string, any>();
      const jrnCache = new Map<string, any>();
      const getPub = async (name: string | null) => {
        if (!name) return null;
        if (pubCache.has(name)) return pubCache.get(name);
        const p = await upsertPublisherByName(name, 'Admin'); pubCache.set(name, p); return p;
      };
      const getJrn = async (issn: string | null, data: any) => {
        if (!issn) return await upsertJournalByIssn(issn, data);
        if (jrnCache.has(issn)) return jrnCache.get(issn);
        const j = await upsertJournalByIssn(issn, data); jrnCache.set(issn, j); return j;
      };
      for (let i = 0; i < rows.length; i++) {
        const b = { ...rows[i], contentType: req.body.contentType };
        try {
          if (!b.title || !String(b.title).trim()) throw new Error('Title is required');
          if (kind === 'book') {
            await (prisma as any).book.create({ data: buildAdminBook(b, by) });
          } else {
            const data = buildAdminArticle(b, by);
            const publisher = await getPub(data.publisherName);
            const journal = await getJrn(data.journalIssn, {
              title: data.journalName || 'Unknown Journal',
              publisherId: publisher?.id || null, publisherName: data.publisherName || null,
              domain: data.domain, subject: data.subject, openAccess: data.accessType === 'OpenAccess', startYear: data.year || null,
            });
            await (prisma as any).article.create({ data: { ...data, publisherId: publisher?.id || null, journalId: journal?.id || null } });
          }
          success++;
        } catch (e: any) {
          failed++;
          errors.push({ row: i + 2, item: { title: b.title }, error: e?.message || 'Failed' });
        }
      }
      res.json({ success, failed, errors: errors.slice(0, 100) });
    } catch (e: any) { console.error("admin library bulk:", e); res.status(500).json({ error: "Bulk import failed" }); }
  });

  app.put("/api/admin/library/items/:kind/:id", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const kind = req.params.kind === 'book' ? 'book' : 'article';
      const by = req.user?.email || 'Admin';
      // Partial status-only update (used by list toggle)
      if (Object.keys(req.body).length === 1 && req.body.status) {
        const updated = await (prisma as any)[kind].update({ where: { id: req.params.id }, data: { status: req.body.status } });
        return res.json(aliasItem(updated));
      }
      const data: any = kind === 'book' ? buildAdminBook(req.body, by) : buildAdminArticle(req.body, by);
      if (kind === 'article') {
        const publisher = await upsertPublisherByName(data.publisherName, 'Admin');
        const journal = await upsertJournalByIssn(data.journalIssn, {
          title: data.journalName || 'Unknown Journal',
          publisherId: publisher?.id || null, publisherName: data.publisherName || null,
          domain: data.domain, subject: data.subject, openAccess: data.accessType === 'OpenAccess', startYear: data.year || null,
        });
        data.publisherId = publisher?.id || null;
        data.journalId = journal?.id || null;
      }
      const updated = await (prisma as any)[kind].update({ where: { id: req.params.id }, data });
      if (kind === 'book' && Array.isArray(req.body.chapters)) {
        await (prisma as any).chapter.deleteMany({ where: { bookId: req.params.id } });
        const chs = req.body.chapters.filter((c: any) => c && c.title);
        if (chs.length) await (prisma as any).chapter.createMany({ data: chs.map((c: any, i: number) => ({ bookId: req.params.id, title: c.title, authors: c.authors || null, pdfUrl: c.pdfUrl || null, pages: c.pages || null, chapterNumber: c.chapterNumber ? parseInt(c.chapterNumber) : (i + 1), status: req.body.status || 'Published' })) });
      }
      res.json(aliasItem(updated));
    } catch (e: any) { console.error("admin library update:", e); res.status(500).json({ error: "Failed to update item" }); }
  });

  app.delete("/api/admin/library/items/:kind/:id", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const kind = req.params.kind === 'book' ? 'book' : 'article';
      await (prisma as any)[kind].delete({ where: { id: req.params.id } });
      res.json({ message: "Deleted" });
    } catch (e: any) { res.status(500).json({ error: "Failed to delete item" }); }
  });

  app.post("/api/admin/library/bulk", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const { action, kind: k, ids } = req.body;
      const kind = k === 'book' ? 'book' : 'article';
      if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "No items" });
      const model = (prisma as any)[kind];
      if (action === 'Delete') { await model.deleteMany({ where: { id: { in: ids } } }); return res.json({ message: `${ids.length} deleted` }); }
      const status = action === 'Publish' ? 'Published' : 'Draft';
      await model.updateMany({ where: { id: { in: ids } }, data: { status } });
      res.json({ message: `${ids.length} set to ${status}` });
    } catch (e: any) { res.status(500).json({ error: "Bulk action failed" }); }
  });

  // Admin: Content CRUD
  app.get("/api/admin/content", authenticateJWT, requireSuperAdmin, async (req: any, res) => {

    try {
      const { domain, contentType, search, status, page = "1", limit = "10" } = req.query;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      
      const where: any = {};
      if (domain) where.domain = domain;
      if (contentType) where.contentType = contentType;
      if (status) where.status = status;
      if (search) {
        where.OR = [
          { title: { contains: search as string, mode: "insensitive" } },
          { authors: { contains: search as string, mode: "insensitive" } },
          { description: { contains: search as string, mode: "insensitive" } },
        ];
      }

      const [contents, total] = await Promise.all([
        prisma.content.findMany({ where, skip, take: parseInt(limit as string), orderBy: { publishedAt: 'desc' } }),
        prisma.content.count({ where })
      ]);

      res.json({ data: contents, total, page: parseInt(page as string), limit: parseInt(limit as string) });
    } catch (error) {
      console.error("Admin Content GET Error:", error);
      res.status(500).json({ error: "Failed to fetch content" });
    }
  });

  app.post("/api/admin/content", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { title, description, authors, domain, contentType, subjectArea, fileUrl, thumbnailUrl, tags, price, accessType, status, publishingMode } = req.body;
      const newContent = await prisma.content.create({
        data: { title, description, authors, domain, contentType, subjectArea, fileUrl, thumbnailUrl, tags, price: parseFloat(price) || 0, accessType, status, publishingMode: publishingMode || "Direct" }
      });
      res.json(newContent);
    } catch (error) {
      console.error("Admin Content POST Error:", error);
      res.status(500).json({ error: "Failed to create content" });
    }
  });

  app.get("/api/admin/content/:id", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { id } = req.params;
      const content = await prisma.content.findUnique({ where: { id } });
      if (!content) return res.status(404).json({ error: "Content not found" });
      res.json(content);
    } catch (error) {
      console.error("Admin Content GET Error:", error);
      res.status(500).json({ error: "Failed to fetch content details" });
    }
  });

  app.put("/api/admin/content/:id", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      if (data.price !== undefined) data.price = parseFloat(data.price) || 0;
      const updatedContent = await prisma.content.update({ where: { id }, data });
      res.json(updatedContent);
    } catch (error) {
      console.error("Admin Content PUT Error:", error);
      res.status(500).json({ error: "Failed to update content" });
    }
  });

  app.delete("/api/admin/content-drafts-cleanup", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { limit, domain, contentType } = req.query;
      let count = 0;

      const where: any = { status: "Draft" };
      if (domain) where.domain = domain;
      if (contentType) where.contentType = contentType;

      if (limit && parseInt(limit) > 0) {
        const take = parseInt(limit);
        const drafts = await prisma.content.findMany({
          where,
          select: { id: true },
          take: take
        });
        const ids = drafts.map(d => d.id);
        if (ids.length > 0) {
          const result = await prisma.content.deleteMany({ where: { id: { in: ids } } });
          count = result.count;
        }
      } else {
        const result = await prisma.content.deleteMany({ where });
        count = result.count;
      }

      res.json({ success: true, count, message: `Deleted ${count} drafted items.` });
    } catch (error) {
      console.error("Admin Draft Cleanup Error:", error);
      res.status(500).json({ error: "Failed to clean up drafted content" });
    }
  });

  app.post("/api/admin/content-drafts-publish", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { limit, domain, contentType } = req.query;
      let count = 0;

      const where: any = { status: "Draft" };
      if (domain) where.domain = domain;
      if (contentType) where.contentType = contentType;

      if (limit && parseInt(limit) > 0) {
        const take = parseInt(limit);
        const drafts = await prisma.content.findMany({
          where,
          select: { id: true },
          take: take
        });
        const ids = drafts.map(d => d.id);
        if (ids.length > 0) {
          const result = await prisma.content.updateMany({ 
            where: { id: { in: ids } },
            data: { status: "Published", validationStatus: null, flaggedReason: null }
          });
          count = result.count;
        }
      } else {
        const result = await prisma.content.updateMany({ 
          where,
          data: { status: "Published", validationStatus: null, flaggedReason: null }
        });
        count = result.count;
      }

      res.json({ success: true, count, message: `Successfully published ${count} drafted items.` });
    } catch (error) {
      console.error("Admin Draft Publish Error:", error);
      res.status(500).json({ error: "Failed to publish drafted content" });
    }
  });

  app.delete("/api/admin/content/:id", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      await prisma.content.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      console.error("Admin Content DELETE Error:", error);
      res.status(500).json({ error: "Failed to delete content" });
    }
  });

  // Admin: Bulk Import Content
  app.post("/api/admin/content/bulk", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Invalid payload format. Expected { items: [...] }" });
      }

      const generateFingerprint = (title: string, authors: string) => {
        const normalizedTitle = (title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
        const normalizedAuthors = (authors || '').toLowerCase().replace(/[^a-z0-9\s,]/g, '').split(',').map(a => a.trim()).sort().join(',');
        return crypto.createHash('sha256').update(`${normalizedTitle}::${normalizedAuthors}`).digest('hex');
      };

      const results = { success: 0, failed: 0, skipped: 0, errors: [] as any[] };
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
          if (!item.title || !item.authors) {
            results.failed++;
            results.errors.push({ row: i + 1, item, error: "Missing title or authors" });
            continue;
          }
          
          const fingerprint = generateFingerprint(item.title, item.authors);
          
          // Check for existing fingerprint
          const existing = await prisma.content.findUnique({ where: { fingerprint } });
          if (existing) {
            results.skipped++;
            results.errors.push({ row: i + 1, item, error: "Duplicate content (fingerprint match)" });
            continue;
          }

          await prisma.content.create({
            data: {
              title: item.title,
              description: item.description,
              authors: item.authors || "Unknown",
              domain: item.domain,
              contentType: item.contentType || "Book",
              subjectArea: item.subjectArea,
              fileUrl: item.fileUrl,
              thumbnailUrl: item.thumbnailUrl,
              tags: item.tags ? (typeof item.tags === "string" ? (item.tags.startsWith('[') ? JSON.parse(item.tags) : item.tags.split(',').map((t: string) => t.trim())) : item.tags) : [],
              price: parseFloat(item.price) || 0,
              accessType: item.accessType || "Subscription",
              status: item.status || "Published",
              publishingMode: item.publishingMode || "Direct",
              fingerprint
            }
          });
          results.success++;
        } catch (err: any) {
          results.failed++;
          results.errors.push({ row: i + 1, item, error: err.message });
        }
      }

      res.json(results);
    } catch (error) {
      console.error("Bulk Import Error:", error);
      res.status(500).json({ error: "Failed to process bulk import" });
    }
  });

  // POST /api/admin/content/bulk-action
  app.post("/api/admin/content/bulk-action", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { action, contentIds } = req.body;
      if (!action || !Array.isArray(contentIds) || contentIds.length === 0) {
        return res.status(400).json({ error: "Invalid payload. Expected action and contentIds array." });
      }

      if (action === 'Delete') {
        await prisma.content.deleteMany({ where: { id: { in: contentIds } } });
      } else if (action === 'Publish' || action === 'Draft') {
        const statusVal = action === 'Publish' ? 'Published' : 'Draft';
        await prisma.content.updateMany({
          where: { id: { in: contentIds } },
          data: { status: statusVal }
        });
      } else {
        return res.status(400).json({ error: "Unknown action" });
      }

      res.json({ success: true, message: `Successfully applied ${action} to ${contentIds.length} items.` });
    } catch (err: any) {
      console.error("Bulk Action Error:", err);
      res.status(500).json({ error: err.message || "Failed to process bulk action" });
    }
  });

  // Removed duplicate GET /api/admin/users

  app.post("/api/admin/users/:id/block", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { isBlocked } = req.body;
      const user = await prisma.user.update({
        where: { id },
        data: { isBlocked: !!isBlocked }
      });
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to block/unblock user" });
    }
  });

  // Admin: Assign subscription manually to user
  // Mass Assign Subscription (Bundles or Custom)
  app.post("/api/admin/subscriptions/assign", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { userIds, bundleId, planType, durationMonths, domains: inputDomains, contentTypes: inputContentTypes } = req.body;
      
      let finalDomains: string[] = [];
      let finalContentTypes: string[] = [];
      let finalPlanName = "Custom Plan";
      
      if (bundleId) {
        // Fetch bundle specifics
        const bundle = await (prisma as any).bundle.findUnique({ where: { id: bundleId } });
        if (!bundle) return res.status(404).json({ error: "Bundle not found" });
        finalDomains = Array.isArray(bundle.domains) ? bundle.domains as string[] : [];
        finalContentTypes = Array.isArray(bundle.contentTypes) ? bundle.contentTypes as string[] : [];
        finalPlanName = bundle.name;
      } else {
        // Quick Assign Custom
        finalDomains = Array.isArray(inputDomains) ? inputDomains : [inputDomains].filter(Boolean);
        finalContentTypes = Array.isArray(inputContentTypes) ? inputContentTypes : [inputContentTypes].filter(Boolean);
        if (finalDomains.length === 1) finalPlanName = `${finalDomains[0]} Plan`;
        else if (finalDomains.length > 1) finalPlanName = "Multi-Domain Plan";
      }

      if (!finalDomains.length || !finalContentTypes.length) {
        return res.status(400).json({ error: "At least one Domain and one Content Type must be provided or derived from a bundle." });
      }

      let dMonths = parseInt(durationMonths);
      if (isNaN(dMonths)) dMonths = 1;
      const startDate = new Date();
      const endDate = new Date(startDate.getTime());
      endDate.setMonth(endDate.getMonth() + dMonths);

      const createdSubs: any[] = [];
      
      const targets = Array.isArray(userIds) ? userIds : [userIds].filter(Boolean);
      if (targets.length === 0) return res.status(400).json({ error: "No users selected" });

      for (const userId of targets) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const isInst = user?.role === 'Institution';
        let assignedInstitutionId = null;
        
        if (isInst) {
           if (user.institutionId) {
             assignedInstitutionId = user.institutionId;
           } else {
             const inst = await prisma.institution.findFirst({ where: { subscriptionId: userId } });
             if (inst) assignedInstitutionId = inst.id;
           }
        }

        const sub = await prisma.subscription.create({
          data: {
            userId: isInst ? null : userId,
            institutionId: assignedInstitutionId,
            planName: finalPlanName,
            planType: planType || "Custom",
            durationMonths: dMonths,
            domains: finalDomains,
            contentTypes: finalContentTypes,
            startDate,
            endDate,
            status: "Active"
          }
        });
        createdSubs.push(sub);
      }

      res.json({ success: true, subscriptions: createdSubs });
    } catch (error: any) {
      console.error("Assign subscription error:", error);
      res.status(500).json({ error: error.message || "Failed to assign subscription" });
    }
  });

  // GET /api/bundles - List active pre-built subscription packages
  app.get("/api/bundles", authenticateJWT, async (req: any, res) => {
    try {
      const bundles = await (prisma as any).bundle.findMany({
        where: { status: 'Active' },
        orderBy: { name: 'asc' }
      });
      res.json(bundles);
    } catch (error) {
      console.error("Fetch bundles error:", error);
      res.status(500).json({ error: "Failed to fetch bundles" });
    }
  });

  // Admin: Subscription Requests
  app.get("/api/admin/subscription-requests", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { status } = req.query;
      const where: any = {};
      if (status) where.status = status;

      const requests = await (prisma as any).subscriptionRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { user: true, subscription: true }
      });
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch subscription requests" });
    }
  });

  app.post("/api/admin/subscription-requests", async (req: any, res) => {
    try {
      const { userName, email, planType, durationMonths, planDescription, paymentRef, notes, userId } = req.body;
      const request = await (prisma as any).subscriptionRequest.create({
        data: { userName, email, planType, durationMonths: parseInt(durationMonths) || 1, planDescription, paymentRef, notes, userId }
      });
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to create subscription request" });
    }
  });

  app.post("/api/admin/subscription-requests/:id/approve", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.body;

      const requestObj = await (prisma as any).subscriptionRequest.findUnique({ where: { id } });
      if (!requestObj) return res.status(404).json({ error: "Request not found" });

      const start = startDate ? new Date(startDate) : new Date();
      let end: Date;
      if (endDate) {
        end = new Date(endDate);
      } else {
        end = new Date(start);
        end.setMonth(end.getMonth() + (requestObj.durationMonths || 1));
      }

      const subscription = await (prisma as any).subscription.create({
        data: {
          userId: requestObj.userId,
          planName: requestObj.planDescription || requestObj.planType,
          planType: requestObj.planType,
          durationMonths: requestObj.durationMonths,
          startDate: start,
          endDate: end,
          status: 'Active',
          requestId: id
        }
      });

      await (prisma as any).subscriptionRequest.update({
        where: { id },
        data: { status: 'Approved' }
      });

      res.json({ subscription, request: { ...requestObj, status: 'Approved' } });
    } catch (error: any) {
      console.error("Approve subscription request error:", error);
      res.status(500).json({ error: error.message || "Failed to approve request" });
    }
  });

  app.post("/api/admin/subscription-requests/:id/reject", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { rejectionNote } = req.body;
      const updated = await (prisma as any).subscriptionRequest.update({
        where: { id },
        data: { status: 'Rejected', rejectionNote }
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to reject request" });
    }
  });

  // Admin: Payments Management
  app.get("/api/admin/payments", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const payments = await prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        include: { user: true }
      });
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });

  // Admin: Subscription Management
  app.get("/api/admin/subscriptions", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { status } = req.query;
      const where: any = {};
      if (status) where.status = status;

      // Auto-expire subscriptions
      await (prisma as any).subscription.updateMany({
        where: { endDate: { lt: new Date() }, status: 'Active' },
        data: { status: 'Expired' }
      });

      const subscriptions = await (prisma as any).subscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { user: true, request: true, institution: { include: { users: true } } }
      });
      res.json(subscriptions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch subscriptions" });
    }
  });

  app.put("/api/admin/subscriptions/:id", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, endDate, cancelledAt } = req.body;
      const data: any = {};
      if (status) data.status = status;
      if (endDate) data.endDate = new Date(endDate);
      if (status === 'Cancelled') data.cancelledAt = new Date();

      const updated = await (prisma as any).subscription.update({ where: { id }, data });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update subscription" });
    }
  });

  // Create Razorpay Order
  app.post("/api/payment/order", async (req, res) => {
    try {
      const { amount, currency = "INR", receipt } = req.body;
      
      // Check if keys exist, if not, fallback to Mock Payment Order for local dev ONLY
      if (process.env.NODE_ENV !== "production" && (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)) {
        console.log("ℹ️ [Razorpay] Keys not configured. Falling back to local mock order...");
        return res.json({
          id: `order_mock_${Date.now()}`,
          amount: Math.round(amount * 100),
          currency: currency,
          receipt,
          isMock: true
        });
      }

      const razorpay = getRazorpay();
      const options = {
        amount: Math.round(amount * 100), // amount in the smallest currency unit
        currency,
        receipt,
      };
      const order = await razorpay.orders.create(options);
      res.json({
        ...order,
        razorpayKey: process.env.RAZORPAY_KEY_ID
      });
    } catch (error) {
      console.error("Razorpay Order Error:", error);
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  // Verify Razorpay Payment
  app.post("/api/payment/verify", async (req, res) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, items, userId, guestData } = req.body;
      
      let isVerified = false;
      const isMockOrder = process.env.NODE_ENV !== "production" && razorpay_order_id && razorpay_order_id.startsWith("order_mock_");
      
      if (isMockOrder) {
        console.log("✅ [Razorpay] Mock Order verified automatically for local development.");
        isVerified = true;
      } else {
        const keySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = crypto
          .createHmac("sha256", keySecret)
          .update(sign.toString())
          .digest("hex");
          
        isVerified = razorpay_signature === expectedSign;
        
        if (!isVerified) {
          console.warn(`⚠️ [Razorpay] Payment signature mismatch for Order: ${razorpay_order_id}`);
        }
      }

      if (isVerified) {
        let finalUserId = userId || null;
        let isNewUser = false;
        let generatedPassword = "";

        // Guest Checkout Handling
        if (!finalUserId && guestData && guestData.email) {
          try {
            const existingUser = await prisma.user.findUnique({ where: { email: guestData.email } });
            if (existingUser) {
              finalUserId = existingUser.id;
            } else {
              // Create new user for guest
              generatedPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase() + "!";
              const hashedPassword = await bcrypt.hash(generatedPassword, 10);
              
              const newUser = await prisma.user.create({
                data: {
                  email: guestData.email,
                  displayName: guestData.name || "New User",
                  password: hashedPassword,
                  role: guestData.userCategory === 'Institution' || guestData.organization ? 'Institution' : 'Subscriber',
                  organization: guestData.organization || null,
                  status: 'Active',
                  isFirstLogin: true,
                }
              });
              finalUserId = newUser.id;
              isNewUser = true;
            }
          } catch (userErr) {
            console.error("Guest User Creation Error:", userErr);
          }
        }

        // Payment verified, save to PostgreSQL
        if (items && amount) {
          await prisma.payment.create({
            data: {
              orderId: razorpay_order_id,
              paymentId: razorpay_payment_id,
              amount: parseFloat(amount),
              status: "Success",
              userId: finalUserId,
              items: items || []
            }
          });

          // Log Coupon Usage if present
          if (req.body.couponCode && req.body.discountAmount > 0) {
            const coupon = await prisma.coupon.findUnique({ where: { code: req.body.couponCode } });
            if (coupon) {
              await prisma.couponUsage.create({
                data: {
                  couponId: coupon.id,
                  userId: finalUserId,
                  orderId: razorpay_order_id,
                  discount: parseFloat(req.body.discountAmount)
                }
              });
              await prisma.coupon.update({
                where: { id: coupon.id },
                data: { usedCount: { increment: 1 } }
              });
            }
          }

          let newInstitutionId = null;
          if (finalUserId) {
            const u = await prisma.user.findUnique({ where: { id: finalUserId } });
            if (u && u.role === 'Institution') {
               if (u.institutionId) {
                 newInstitutionId = u.institutionId;
               } else {
                 let inst = await prisma.institution.findFirst({ where: { subscriptionId: u.id } });
                 if (!inst && u.organization) {
                    inst = await prisma.institution.create({
                      data: {
                        name: u.organization,
                        status: 'Active',
                        subscriptionId: u.id
                      }
                    });
                    await prisma.user.update({
                      where: { id: u.id },
                      data: { institutionId: inst.id }
                    });
                 }
                 newInstitutionId = inst?.id || null;
               }
            }
          }

          if (Array.isArray(items)) {
            for (const item of items) {
              const days = item.duration === 'Yearly' ? 365 : item.duration === 'Half-Yearly' ? 180 : item.duration === 'Quarterly' ? 90 : 30;
              const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
              
              await prisma.subscription.create({
                data: {
                  domainId: item.domainId ? String(item.domainId) : null,
                  domainName: item.domainName,
                  planName: item.planName || item.plan?.name || "Trial", 
                  duration: item.duration || "Monthly",
                  status: "Active",
                  userId: finalUserId,
                  institutionId: newInstitutionId,
                  endDate
                }
              });
            }
          }

          if (isNewUser && guestData && guestData.email) {
            try {
               await sendCredentialsEmail(
                 guestData.email,
                 guestData.name || "New User",
                 generatedPassword,
                 {
                   planName: items[0]?.planName || "Purchased Subscription",
                   validity: items[0]?.duration || "Monthly",
                 }
               );
            } catch (err) {
               console.error("Failed to send guest credentials email:", err);
            }
          }

          // Automated Order & Receipt Notification Email Triggers
          try {
            let targetEmail = guestData?.email || "";
            let targetName = guestData?.name || "Valued Customer";

            if (!targetEmail && finalUserId) {
              const dbUser = await prisma.user.findUnique({ where: { id: finalUserId } });
              if (dbUser) {
                targetEmail = dbUser.email;
                targetName = dbUser.displayName || "Subscriber";
              }
            }

            const backendInvoiceNum = `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

            if (targetEmail) {
              // Trigger automated emails asynchronously so the request responds promptly to Razorpay
              sendPaymentSuccessEmails(
                targetEmail,
                targetName,
                parseFloat(amount).toFixed(2),
                items || [],
                razorpay_payment_id || '',
                razorpay_order_id || '',
                backendInvoiceNum
              ).catch(err => console.error("⚠️ Auto-payment success email trigger failed:", err));
            }
          } catch (emailSendErr) {
            console.error("Failed to trigger automated receipt notification:", emailSendErr);
          }
        }
        res.json({ status: "success", message: "Payment verified successfully" });
      } else {
        res.status(400).json({ status: "failure", message: "Invalid signature" });
      }
    } catch (error) {
      console.error("Payment Verification Error:", error);
      if (!res.headersSent) {
        res.status(500).json({ status: "error", message: "Payment verification failed" });
      }
    }
  });

  // Debug endpoint to verify deployment
  app.get("/api/debug-version", (req, res) => {
    res.json({ version: "1.0.1", status: "New UI deployed!" });
  });

  // Demo Session Request
  app.post("/api/demo-request", async (req, res) => {
    try {
      const formData = req.body;
      const { 
        fullName, 
        institutionalEmail, 
        institutionName, 
        designation, 
        whatsappNumber,
        city,
        state,
        department,
        requestType
      } = formData;

      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      
      // Save to database
      await prisma.demoRequest.create({
        data: {
          fullName,
          institutionalEmail,
          institutionName,
          designation,
          whatsappNumber,
          city,
          state,
          department,
          requestType: requestType || "Institution"
        }
      });

      // Also create a Lead in the CRM Pipeline
      try {
        await prisma.lead.create({
          data: {
            name: fullName,
            email: institutionalEmail,
            phone: whatsappNumber,
            organization: institutionName,
            state: state || null,
            source: 'Demo Request',
            status: 'All',
            notes: `Requested Demo Type: ${requestType || "Institution"}`,
          }
        });
      } catch (e) {
        console.error("Failed to auto-create lead for demo request", e);
      }

      // 1. Send Admin Notification Email
      const adminMailOptions = {
        from: emailFrom,
        to: process.env.ADMIN_EMAIL || COMPANY_DETAILS.email,
        subject: `New ${requestType||'Demo'} Session Request: ${institutionName}`,
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;">`+
          `<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">🎯 New Demo Session Request (${requestType || "Institution"})</p>`+
          `<p style="margin:0 0 20px;font-size:13px;color:#475569;">A user has requested a personalized demo of the platform.</p>`+
          `<table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:16px;">`+
          `<tr style="background:#f8fafc;"><td style="padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;" colspan="2">Request Details</td></tr>`+
          `<tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;width:38%;border-bottom:1px solid #f1f5f9;">Type</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#2563eb;border-bottom:1px solid #f1f5f9;">${requestType||'Institution'}</td></tr>`+
          `<tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;width:38%;border-bottom:1px solid #f1f5f9;">Full Name</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9;">${fullName}</td></tr>`+
          `<tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Email</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e3a6e;border-bottom:1px solid #f1f5f9;">${institutionalEmail}</td></tr>`+
          `<tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Organization / Inst.</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9;">${institutionName}</td></tr>`+
          `<tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">WhatsApp</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${whatsappNumber||'N/A'}</td></tr>`+
          `<tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Department / Tech</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${department}</td></tr>`+
          `<tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;">Location</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;">${city}, ${state}</td></tr>`+
          `</table>`+
          `</td></tr>`
        )
      };

      // 2. Send User Confirmation Email
      const userMailOptions = {
        from: emailFrom,
        to: institutionalEmail,
        subject: "Your Demo Session Request has been received",
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;">`+
          `<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">👋 Demo Request Received!</p>`+
          `<p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.7;">Dear <strong>${fullName}</strong>, thank you for showing interest in a personalized demo. Our team will contact you within 24 hours to schedule a convenient walkthrough of the platform.</p>`+
          `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;margin-bottom:20px;"><tr><td style="padding:18px 20px;">`+
          `<p style="color:#15803d;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">🕐 Next Steps</p>`+
          `<p style="margin:5px 0;font-size:13px;color:#1e293b;"><span style="background:#15803d;color:#fff;font-size:10px;font-weight:700;border-radius:50%;padding:2px 6px;">1</span>&nbsp; Our experts review your request details</p>`+
          `<p style="margin:5px 0;font-size:13px;color:#1e293b;"><span style="background:#15803d;color:#fff;font-size:10px;font-weight:700;border-radius:50%;padding:2px 6px;">2</span>&nbsp; We reach out via email/WhatsApp to fix a slot</p>`+
          `<p style="margin:5px 0;font-size:13px;color:#1e293b;"><span style="background:#15803d;color:#fff;font-size:10px;font-weight:700;border-radius:50%;padding:2px 6px;">3</span>&nbsp; A guided platform tour tailored for your needs</p>`+
          `</td></tr></table>`+
          `<p style="font-size:12px;color:#64748b;margin:0;">Need immediate assistance? Email <a href="mailto:${COMPANY_DETAILS.email}" style="color:#1e3a6e;font-weight:600;">${COMPANY_DETAILS.email}</a></p>`+
          `</td></tr>`
        )
      };

      await sendMail(adminMailOptions);
      await sendMail(userMailOptions);

      res.json({ status: "success", message: "Demo request submitted successfully" });
    } catch (error) {
      console.error("Demo Request Error:", error);
      res.status(500).json({ error: "Failed to submit demo request" });
    }
  });

  // Admin: Get all demo requests
  app.get("/api/admin/demo-requests", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const requests = await prisma.demoRequest.findMany({
        orderBy: { createdAt: "desc" }
      });
      
      const verifications = await (prisma as any).emailVerification.findMany();
      const verifiedEmails = new Set(verifications.filter((v: any) => v.isVerified).map((v: any) => v.email));

      const enhancedRequests = requests.map((req: any) => ({
        ...req,
        isEmailVerified: verifiedEmails.has(req.institutionalEmail)
      }));

      res.json(enhancedRequests);
    } catch (error) {
      console.error("Failed to fetch demo requests:", error);
      res.status(500).json({ error: "Failed to fetch demo requests" });
    }
  });

  // Admin: Update demo request status or notes
  app.patch("/api/admin/demo-requests/:id", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { status, adminNotes } = req.body;
      const updated = await prisma.demoRequest.update({
        where: { id },
        data: { status, adminNotes }
      });
      res.json(updated);
    } catch (error) {
      console.error("Failed to update demo request:", error);
      res.status(500).json({ error: "Failed to update demo request" });
    }
  });

  // Admin: Provision Demo Subscription
  app.post("/api/admin/demo-requests/:id/provision", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { durationDays } = req.body;
      const days = Number(durationDays) || 14;

      const demoReq = await prisma.demoRequest.findUnique({ where: { id } });
      if (!demoReq) return res.status(404).json({ error: "Demo request not found" });

      const existingUser = await prisma.user.findUnique({ where: { email: demoReq.institutionalEmail } });
      if (existingUser) return res.status(400).json({ error: "User with this email already exists. Cannot auto-provision." });

      const plainPassword = generatePassword();
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      const isStudent = demoReq.requestType === 'Student';
      const targetRole = isStudent ? "Subscriber" : "Institution";

      let newInstId = undefined;
      if (!isStudent) {
        const newInst = await prisma.institution.create({
          data: { name: demoReq.institutionName, status: "Active" }
        });
        newInstId = newInst.id;
      }

      const newUser = await prisma.user.create({
        data: {
          email: demoReq.institutionalEmail,
          password: hashedPassword,
          displayName: demoReq.fullName,
          role: targetRole,
          status: "Active",
          isFirstLogin: true,
          organization: demoReq.institutionName,
          institutionId: newInstId,
          isDemoAccount: true,
          demoExpiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000)
        }
      });

      await prisma.subscription.create({
        data: {
          domainName: demoReq.department,
          planName: `${demoReq.requestType || 'Demo'} Trial`,
          durationMonths: 1,
          status: "Active",
          userId: newUser.id,
          institutionId: newInstId,
          endDate: new Date(Date.now() + days * 24 * 60 * 60 * 1000)
        }
      });

      await sendCredentialsEmail(
        demoReq.institutionalEmail, 
        demoReq.fullName, 
        plainPassword,
        {
          institution: demoReq.institutionName,
          department: demoReq.department,
          planName: "Demo Access Trial",
          validity: `${days} Days`,
          customMessage: `We are delighted to inform you that your <strong>Demo Request has been accepted</strong>. Your temporary trial access has been <span style="color:#16A34A;font-weight:700;">successfully provisioned</span> for your requested department.`
        }
      );

      const updated = await prisma.demoRequest.update({
        where: { id },
        data: { 
          status: "Completed",
          adminNotes: (demoReq.adminNotes ? demoReq.adminNotes + "\n\n" : "") + `[AUTO] Provisioned ${days}-day demo access on ${new Date().toISOString().split('T')[0]}`
        }
      });

      res.json({ success: true, request: updated });
    } catch (error) {
      console.error("Failed to provision demo:", error);
      res.status(500).json({ error: "Failed to provision demo account" });
    }
  });

  // Admin: Resend Demo Credentials (Reset password and email new one)
  app.post("/api/admin/demo-requests/:id/resend-credentials", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const demoReq = await prisma.demoRequest.findUnique({ where: { id } });
      if (!demoReq) return res.status(404).json({ error: "Demo request not found" });

      const userObj = await prisma.user.findUnique({ where: { email: demoReq.institutionalEmail } });
      if (!userObj) return res.status(404).json({ error: "No associated user account found for this email." });

      const plainPassword = generatePassword();
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      // Reset password and reset first-login status
      await prisma.user.update({
        where: { id: userObj.id },
        data: {
          password: hashedPassword,
          isFirstLogin: true
        }
      });

      await sendCredentialsEmail(
        demoReq.institutionalEmail, 
        demoReq.fullName, 
        plainPassword,
        {
          institution: demoReq.institutionName,
          department: demoReq.department,
          planName: "Demo Access Trial",
          validity: userObj.demoExpiresAt ? `${Math.ceil((userObj.demoExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))} Days remaining` : 'N/A',
          customMessage: `As requested, we have <strong>reset your Demo Access credentials</strong>. Your access has been refreshed and updated.`
        }
      );

      // Log in admin notes
      const updated = await prisma.demoRequest.update({
        where: { id },
        data: {
          adminNotes: (demoReq.adminNotes ? demoReq.adminNotes + "\n\n" : "") + `[AUTO] Credentials reset and resent on ${new Date().toISOString().split('T')[0]}`
        }
      });

      res.json({ success: true, request: updated });
    } catch (error) {
      console.error("Failed to resend credentials:", error);
      res.status(500).json({ error: "Failed to resend credentials" });
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

      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      const adminMailOptions = {
        from: emailFrom,
        to: process.env.ADMIN_EMAIL || COMPANY_DETAILS.email,
        subject: `New Institutional Trial Request: ${institutionName}`,
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;">`+
          `<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">🏛️ New Institutional Trial Request</p>`+
          `<p style="margin:0 0 20px;font-size:13px;color:#475569;">An institution has requested a trial access through the website.</p>`+
          `<table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:16px;">`+
          `<tr style="background:#f8fafc;"><td style="padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;" colspan="2">Personal Details</td></tr>`+
          `<tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;width:38%;border-bottom:1px solid #f1f5f9;">Full Name</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9;">${fullName}</td></tr>`+
          `<tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Email</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e3a6e;border-bottom:1px solid #f1f5f9;">${institutionalEmail}</td></tr>`+
          `<tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Designation</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${designation||'N/A'}</td></tr>`+
          `<tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">WhatsApp</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${whatsappNumber||'N/A'}</td></tr>`+
          `<tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Institution</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9;">${institutionName}</td></tr>`+
          `<tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Department</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${department}</td></tr>`+
          `<tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">City / State</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${city}, ${state}</td></tr>`+
          `<tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;">Country</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;">${country}</td></tr>`+
          `</table>`+
          `</td></tr>`
        )
      };

      // 2. Send User Confirmation Email
      const userMailOptions = {
        from: emailFrom,
        to: institutionalEmail,
        subject: "Your Institutional Trial Request has been received",
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;">`+
          `<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">🏛️ Trial Request Received!</p>`+
          `<p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.7;">Dear <strong>${fullName}</strong>, thank you for requesting an institutional trial for <strong>${institutionName}</strong> — <strong>${department}</strong>. Our team is reviewing your request and will get in touch shortly to set up the access.</p>`+
          `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;margin-bottom:20px;"><tr><td style="padding:18px 20px;">`+
          `<p style="color:#15803d;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">🕐 What Happens Next?</p>`+
          `<p style="margin:5px 0;font-size:13px;color:#1e293b;"><span style="background:#15803d;color:#fff;font-size:10px;font-weight:700;border-radius:50%;padding:2px 6px;">1</span>&nbsp; Our institutional access team verifies your details</p>`+
          `<p style="margin:5px 0;font-size:13px;color:#1e293b;"><span style="background:#15803d;color:#fff;font-size:10px;font-weight:700;border-radius:50%;padding:2px 6px;">2</span>&nbsp; We discuss IP-based or remote access setup</p>`+
          `<p style="margin:5px 0;font-size:13px;color:#1e293b;"><span style="background:#15803d;color:#fff;font-size:10px;font-weight:700;border-radius:50%;padding:2px 6px;">3</span>&nbsp; Your institution gets seamless trial access</p>`+
          `</td></tr></table>`+
          `<p style="font-size:12px;color:#64748b;margin:0;">Questions? Email <a href="mailto:${COMPANY_DETAILS.email}" style="color:#1e3a6e;font-weight:600;">${COMPANY_DETAILS.email}</a> or call <strong>+91-120-4781200</strong></p>`+
          `</td></tr>`
        )
      };

      await sendMail(adminMailOptions);
      await sendMail(userMailOptions);

      res.json({ status: "success", message: "Trial request submitted successfully" });
    } catch (error) {
      console.error("Institutional Trial Error:", error);
      res.status(500).json({ error: "Failed to submit trial request" });
    }
  });

  // Contact Form Submission — also persists to DB for admin management
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

      // Persist to DB for admin management
      try {
        await (prisma as any).contactInquiry.create({
          data: {
            fullName,
            email,
            mobile: mobile || null,
            whatsapp: whatsapp || null,
            designation: designation || null,
            departments: Array.isArray(departments) ? departments : (departments ? [departments] : []),
            state: state || null,
            organization: organization || null,
            message,
            status: 'All',
          }
        });

        // Also create a Lead in the CRM Pipeline
        await prisma.lead.create({
          data: {
            name: fullName,
            email: email,
            phone: mobile || whatsapp || null,
            organization: organization || null,
            state: state || null,
            source: 'Contact Inquiry',
            status: 'All',
            notes: message,
          }
        });
      } catch (dbErr) {
        console.error('Failed to save contact inquiry to DB:', dbErr);
        // Non-blocking — still send email
      }

      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      const adminMailOptions = {
        from: emailFrom,
        to: process.env.ADMIN_EMAIL || COMPANY_DETAILS.email,
        subject: "New Contact Inquiry from Website",
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;">`+
          `<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">📩 New Contact Inquiry</p>`+
          `<p style="margin:0 0 20px;font-size:13px;color:#475569;">A new inquiry was submitted via the website contact form.</p>`+
          `<table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:16px;">`+
          `<tr style="background:#f8fafc;"><td style="padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;" colspan="2">Inquiry Details</td></tr>`+
          `<tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;width:35%;border-bottom:1px solid #f1f5f9;">Full Name</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9;">${fullName}</td></tr>`+
          `<tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Email</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e3a6e;border-bottom:1px solid #f1f5f9;">${email}</td></tr>`+
          `<tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Mobile</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${mobile||'N/A'}</td></tr>`+
          `<tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Organization</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${organization||'N/A'}</td></tr>`+
          `<tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Designation</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${designation||'N/A'}</td></tr>`+
          `<tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">State</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${state||'N/A'}</td></tr>`+
          `<tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;">Departments</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;">${Array.isArray(departments)?departments.join(', '):(departments||'N/A')}</td></tr>`+
          `</table>`+
          `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border-radius:10px;border:1px solid #bae6fd;"><tr><td style="padding:16px 20px;">`+
          `<p style="color:#0369a1;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">💬 Message</p>`+
          `<p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0;">${message}</p>`+
          `</td></tr></table>`+
          `</td></tr>`
        )
      };

      // 2. Send User Confirmation Email
      const userMailOptions = {
        from: emailFrom,
        to: email,
        subject: "Thank you for contacting STM Digital Library",
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;">`+
          `<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">✅ We've Got Your Message!</p>`+
          `<p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.7;">Dear <strong>${fullName}</strong>, thank you for contacting <strong>STM Digital Library</strong>. We have received your inquiry and our team will get back to you within <strong>1–2 business days</strong>.</p>`+
          `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border-radius:10px;border:1px solid #bae6fd;margin-bottom:16px;"><tr><td style="padding:16px 20px;">`+
          `<p style="color:#0369a1;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">💬 Your Message</p>`+
          `<p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0;">${message}</p>`+
          `</td></tr></table>`+
          (departments && (Array.isArray(departments) ? departments.length > 0 : true) ?
          `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;border-radius:10px;border:1px solid #ddd6fe;margin-bottom:16px;"><tr><td style="padding:16px 20px;">` +
          `<p style="color:#7e22ce;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">📚 Selected Departments</p>` +
          (Array.isArray(departments) ? departments : [departments]).map((d: string) =>
            `<span style="display:inline-block;background:#ede9fe;color:#6d28d9;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;margin:3px 4px 3px 0;">${d}</span>`
          ).join('') +
          `</td></tr></table>` : '') +
          `<table width="100%" cellpadding="0" cellspacing="0" style="background:#1e3a6e;border-radius:10px;margin-bottom:18px;"><tr><td style="padding:18px 20px;">`+
          `<p style="color:#bfdbfe;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">📞 Reach Us Directly</p>`+
          `<p style="margin:3px 0;font-size:13px;color:#e2e8f0;">📧 <a href="mailto:${COMPANY_DETAILS.email}" style="color:#93c5fd;">${COMPANY_DETAILS.email}</a></p>`+
          `<p style="margin:3px 0;font-size:13px;color:#e2e8f0;">📞 +91-120-4781200</p>`+
          `<p style="margin:3px 0;font-size:13px;color:#e2e8f0;">🌐 <a href="https://journalslibrary.com" style="color:#93c5fd;">journalslibrary.com</a></p>`+
          `</td></tr></table>`+
          `</td></tr>`
        )
      };

      await sendMail(adminMailOptions);
      await sendMail(userMailOptions);

      res.json({ status: "success", message: "Inquiry submitted successfully" });
    } catch (error) {
      console.error("Contact Form Error:", error);
      res.status(500).json({ error: "Failed to submit inquiry" });
    }
  });

  // ── Admin: Contact Inquiries CRUD ───────────────────────────────────────────
  app.get("/api/admin/contact-inquiries", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { status, search } = req.query;
      const where: any = {};
      if (status && status !== 'All') where.status = status as string;
      if (search) {
        where.OR = [
          { fullName:     { contains: search as string, mode: 'insensitive' } },
          { email:        { contains: search as string, mode: 'insensitive' } },
          { organization: { contains: search as string, mode: 'insensitive' } },
          { message:      { contains: search as string, mode: 'insensitive' } },
        ];
      }
      const inquiries = await (prisma as any).contactInquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
      res.json(inquiries);
    } catch (error) {
      console.error('GET contact-inquiries error:', error);
      res.status(500).json({ error: 'Failed to fetch contact inquiries' });
    }
  });

  app.get("/api/admin/contact-inquiries/:id", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const inquiry = await (prisma as any).contactInquiry.findUnique({ where: { id: req.params.id } });
      if (!inquiry) return res.status(404).json({ error: 'Not found' });
      // Auto-mark as Read when admin opens it
      if (inquiry.status === 'New') {
        await (prisma as any).contactInquiry.update({ where: { id: req.params.id }, data: { status: 'Read' } });
        inquiry.status = 'Read';
      }
      res.json(inquiry);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch inquiry' });
    }
  });

  app.put("/api/admin/contact-inquiries/:id", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { status, adminNotes } = req.body;
      const data: any = {};
      if (status) data.status = status;
      if (adminNotes !== undefined) data.adminNotes = adminNotes;
      const updated = await (prisma as any).contactInquiry.update({ where: { id: req.params.id }, data });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update inquiry' });
    }
  });

  app.post("/api/admin/contact-inquiries/:id/reply", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { replyText, subject } = req.body;
      const inquiry = await (prisma as any).contactInquiry.findUnique({ where: { id: req.params.id } });
      if (!inquiry) return res.status(404).json({ error: 'Inquiry not found' });
      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || '').trim();
      await sendMail({
        from: `"STM Digital Library" <${emailFrom}>`,
        to: inquiry.email,
        subject: subject || `Re: Your Contact Inquiry – STM Digital Library`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #1e293b;">
            <div style="background: #1e293b; padding: 28px 32px; border-radius: 12px 12px 0 0;">
              <h1 style="color: #fff; margin: 0; font-size: 20px;">STM Digital Library</h1>
              <p style="color: #94a3b8; margin: 4px 0 0; font-size: 13px;">Response to your enquiry</p>
            </div>
            <div style="background: #fff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 32px;">
              <p style="margin: 0 0 16px; font-size: 15px;">Dear <strong>${inquiry.fullName}</strong>,</p>
              <p style="margin: 0 0 24px; color: #475569; font-size: 14px; line-height: 1.7;">${(replyText as string).replace(/\n/g, '<br/>')}</p>
              <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 20px;">
                <p style="margin: 0; font-size: 13px; color: #64748b;">
                  For further assistance, please reply to this email or call us at <strong>+91-120-4781200</strong>.<br/>
                  <strong>${COMPANY_DETAILS.name}</strong> | ${COMPANY_DETAILS.email}
                </p>
              </div>
            </div>
          </div>
        `
      });
      const updated = await (prisma as any).contactInquiry.update({
        where: { id: req.params.id },
        data: { status: 'Replied', replyText, repliedAt: new Date() }
      });
      res.json({ success: true, inquiry: updated });
    } catch (error) {
      console.error('Reply contact inquiry error:', error);
      res.status(500).json({ error: 'Failed to send reply' });
    }
  });

  app.delete("/api/admin/contact-inquiries/:id", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      await (prisma as any).contactInquiry.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete inquiry' });
    }
  });

  // ── Content Removal / Takedown ──────────────────────────────────────────────
  // A rights complaint is a legal event, so every notice becomes a durable record
  // with a reference, an SLA clock and an append-only audit trail — we must be able
  // to show when a notice arrived and what we did about it.

  const TAKEDOWN_SLA_DAYS = 7;

  const TAKEDOWN_CAPACITIES = ['RightsHolder', 'AuthorisedAgent', 'Author', 'Other'];
  const TAKEDOWN_ACTIONS    = ['RemoveEntirely', 'RemoveFileKeepMetadata', 'AddAttribution', 'Other'];
  const TAKEDOWN_STATUSES   = ['New', 'UnderReview', 'ActionTaken', 'Rejected', 'Withdrawn'];

  /** TDN-<year>-<zero-padded sequence within that year> */
  async function nextTakedownReference(): Promise<string> {
    const year = new Date().getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const countThisYear = await (prisma as any).takedownRequest.count({
      where: { createdAt: { gte: startOfYear } },
    });
    return `TDN-${year}-${String(countThisYear + 1).padStart(4, '0')}`;
  }

  /** Best-effort: pull an id out of a /preview/:id or /dashboard/content/:id URL and see what it is. */
  async function resolveReportedContent(url: string) {
    const out: { matchedContentId?: string; matchedKind?: string; ownershipSource?: string } = {};
    try {
      const uuid = (url.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0];
      if (!uuid) return out;

      const content = await prisma.content.findUnique({ where: { id: uuid }, select: { id: true } });
      if (content) return { matchedContentId: content.id, matchedKind: 'content' };

      const article = await (prisma as any).article.findUnique({
        where: { id: uuid }, select: { id: true, ownershipSource: true },
      });
      if (article) return { matchedContentId: article.id, matchedKind: 'article', ownershipSource: article.ownershipSource };

      const book = await (prisma as any).book.findUnique({
        where: { id: uuid }, select: { id: true, ownershipSource: true },
      });
      if (book) return { matchedContentId: book.id, matchedKind: 'book', ownershipSource: book.ownershipSource };
    } catch {
      // Resolution is a convenience for the reviewer — never fail intake over it.
    }
    return out;
  }

  // Public intake. Deliberately unauthenticated: a rights holder is not our user.
  app.post("/api/takedown", async (req: any, res) => {
    try {
      const {
        requesterName, requesterEmail, requesterPhone, organization,
        capacity, capacityOther,
        contentUrl, contentTitle, identifier,
        ownershipBasis, requestedAction, requestedActionOther, additionalInfo,
        goodFaithDeclared, accuracyDeclared,
      } = req.body || {};

      const missing = ['requesterName', 'requesterEmail', 'contentUrl', 'ownershipBasis']
        .filter(f => !String(req.body?.[f] || '').trim());
      if (missing.length) {
        return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(requesterEmail).trim())) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      if (!goodFaithDeclared || !accuracyDeclared) {
        return res.status(400).json({ error: 'Both declarations must be confirmed before submitting.' });
      }

      const safeCapacity = TAKEDOWN_CAPACITIES.includes(capacity) ? capacity : 'Other';
      const safeAction   = TAKEDOWN_ACTIONS.includes(requestedAction) ? requestedAction : 'RemoveEntirely';

      const resolved  = await resolveReportedContent(String(contentUrl));
      const reference = await nextTakedownReference();
      const now       = new Date();
      const dueAt     = new Date(now.getTime() + TAKEDOWN_SLA_DAYS * 24 * 60 * 60 * 1000);

      const created = await (prisma as any).takedownRequest.create({
        data: {
          reference,
          requesterName:  String(requesterName).trim(),
          requesterEmail: String(requesterEmail).trim(),
          requesterPhone: requesterPhone?.trim() || null,
          organization:   organization?.trim() || null,
          capacity:       safeCapacity,
          capacityOther:  safeCapacity === 'Other' ? (capacityOther?.trim() || null) : null,
          contentUrl:     String(contentUrl).trim(),
          contentTitle:   contentTitle?.trim() || null,
          identifier:     identifier?.trim() || null,
          matchedContentId: resolved.matchedContentId || null,
          matchedKind:      resolved.matchedKind || null,
          ownershipSource:  resolved.ownershipSource || null,
          ownershipBasis:   String(ownershipBasis).trim(),
          requestedAction:  safeAction,
          requestedActionOther: safeAction === 'Other' ? (requestedActionOther?.trim() || null) : null,
          additionalInfo:   additionalInfo?.trim() || null,
          goodFaithDeclared: true,
          accuracyDeclared:  true,
          status: 'New',
          dueAt,
          ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
          userAgent: req.headers['user-agent'] || null,
          auditTrail: [{ event: 'Received', at: now.toISOString(), by: 'public form' }],
        },
      });

      // Notify the rights inbox. Never block the acknowledgement on mail delivery.
      const emailFrom  = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      const rightsInbox = process.env.RIGHTS_EMAIL || process.env.ADMIN_EMAIL || COMPANY_DETAILS.email;
      const actionLabels: Record<string, string> = {
        RemoveEntirely:         'Remove the listing entirely',
        RemoveFileKeepMetadata: 'Remove the file, keep citation metadata',
        AddAttribution:         'Correct or add attribution',
        Other:                  requestedActionOther || 'Other',
      };

      transporter?.sendMail?.({
        from: emailFrom,
        to: rightsInbox,
        replyTo: created.requesterEmail,
        subject: `[${reference}] Content removal request — due ${dueAt.toDateString()}`,
        html: `
          <h2>Content removal request ${reference}</h2>
          <p><strong>Respond by ${dueAt.toDateString()}</strong> (${TAKEDOWN_SLA_DAYS}-day published SLA).</p>
          <table cellpadding="6" style="border-collapse:collapse">
            <tr><td><strong>From</strong></td><td>${created.requesterName} &lt;${created.requesterEmail}&gt;</td></tr>
            <tr><td><strong>Organisation</strong></td><td>${created.organization || '—'}</td></tr>
            <tr><td><strong>Acting as</strong></td><td>${created.capacityOther || safeCapacity}</td></tr>
            <tr><td><strong>URL</strong></td><td>${created.contentUrl}</td></tr>
            <tr><td><strong>Identifier</strong></td><td>${created.identifier || '—'}</td></tr>
            <tr><td><strong>Origin</strong></td><td>${created.ownershipSource || 'not resolved'}</td></tr>
            <tr><td><strong>Requested</strong></td><td>${actionLabels[safeAction]}</td></tr>
          </table>
          <h3>Basis of claim</h3>
          <p>${String(created.ownershipBasis).replace(/</g, '&lt;')}</p>
          ${created.additionalInfo ? `<h3>Additional information</h3><p>${String(created.additionalInfo).replace(/</g, '&lt;')}</p>` : ''}
        `,
      }).catch?.((e: any) => console.error('[takedown] admin notification failed:', e));

      transporter?.sendMail?.({
        from: emailFrom,
        to: created.requesterEmail,
        subject: `We have received your content removal request (${reference})`,
        html: `
          <p>Dear ${created.requesterName},</p>
          <p>Thank you for contacting us. Your request has been logged as
             <strong>${reference}</strong> and will be reviewed by
             ${dueAt.toDateString()}.</p>
          <p>Reported URL: ${created.contentUrl}</p>
          <p>If you need to add anything, reply to this email quoting the reference above.</p>
          <p>— ${process.env.COMPANY_NAME || COMPANY_DETAILS.name}</p>
        `,
      }).catch?.((e: any) => console.error('[takedown] acknowledgement failed:', e));

      res.status(201).json({ success: true, reference, dueAt });
    } catch (error) {
      console.error('POST /api/takedown error:', error);
      res.status(500).json({ error: 'Could not submit your request. Please email us directly.' });
    }
  });

  app.get("/api/admin/takedown-requests", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { status, search } = req.query;
      const where: any = {};
      if (status && status !== 'All') where.status = status as string;
      if (search) {
        where.OR = [
          { reference:      { contains: search as string, mode: 'insensitive' } },
          { requesterName:  { contains: search as string, mode: 'insensitive' } },
          { requesterEmail: { contains: search as string, mode: 'insensitive' } },
          { organization:   { contains: search as string, mode: 'insensitive' } },
          { contentUrl:     { contains: search as string, mode: 'insensitive' } },
          { contentTitle:   { contains: search as string, mode: 'insensitive' } },
        ];
      }
      const [requests, openCount, overdueCount] = await Promise.all([
        (prisma as any).takedownRequest.findMany({ where, orderBy: { createdAt: 'desc' } }),
        (prisma as any).takedownRequest.count({ where: { status: { in: ['New', 'UnderReview'] } } }),
        (prisma as any).takedownRequest.count({
          where: { status: { in: ['New', 'UnderReview'] }, dueAt: { lt: new Date() } },
        }),
      ]);
      res.json({ requests, openCount, overdueCount });
    } catch (error) {
      console.error('GET takedown-requests error:', error);
      res.status(500).json({ error: 'Failed to fetch takedown requests' });
    }
  });

  app.get("/api/admin/takedown-requests/:id", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const request = await (prisma as any).takedownRequest.findUnique({ where: { id: req.params.id } });
      if (!request) return res.status(404).json({ error: 'Not found' });
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch takedown request' });
    }
  });

  app.put("/api/admin/takedown-requests/:id", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { status, actionTaken, adminNotes } = req.body || {};
      const existing = await (prisma as any).takedownRequest.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ error: 'Not found' });

      const data: any = {};
      const now  = new Date();
      const who  = req.user?.email || req.user?.name || 'admin';
      const trail = Array.isArray(existing.auditTrail) ? [...existing.auditTrail] : [];

      if (status && TAKEDOWN_STATUSES.includes(status) && status !== existing.status) {
        data.status = status;
        trail.push({ event: `Status → ${status}`, at: now.toISOString(), by: who });
        if (status === 'UnderReview' && !existing.acknowledgedAt) data.acknowledgedAt = now;
        if (['ActionTaken', 'Rejected', 'Withdrawn'].includes(status)) data.resolvedAt = now;
      }
      if (actionTaken !== undefined && actionTaken !== existing.actionTaken) {
        data.actionTaken = actionTaken;
        trail.push({ event: 'Action recorded', at: now.toISOString(), by: who, detail: actionTaken });
      }
      if (adminNotes !== undefined) data.adminNotes = adminNotes;

      if (trail.length !== (existing.auditTrail?.length || 0)) data.auditTrail = trail;
      data.handledBy = who;

      const updated = await (prisma as any).takedownRequest.update({ where: { id: req.params.id }, data });
      res.json(updated);
    } catch (error) {
      console.error('PUT takedown-request error:', error);
      res.status(500).json({ error: 'Failed to update takedown request' });
    }
  });

  // Get recent quotation for autofill
  app.get("/api/quotation/customer/:email", async (req, res) => {
    try {
      const email = req.params.email;
      const q = await (prisma as any).quotation.findFirst({
        where: { userEmail: email },
        orderBy: { createdAt: 'desc' }
      });
      if (q) {
        res.json(q);
      } else {
        res.status(404).json({ error: "Not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed" });
    }
  });

  // Save Quotation (Download action)
  app.post("/api/quotation/save", authenticateJWT, requireSalesRole, async (req: any, res) => {
    try {
      const { userEmail, userName, quotationData, userId, organization, state, duration } = req.body;
      
      let creatorEmail = "User / System";
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const token = authHeader.split(" ")[1];
          const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";
          const decoded = jwt.verify(token, JWT_SECRET) as any;
          if (decoded && decoded.email) creatorEmail = decoded.email;
        } catch(e) {}
      }

      const quotationNumber = quotationData.quotationNumber;
      
      await (prisma as any).quotation.upsert({
        where: { id: quotationNumber },
        update: { 
          status: "Downloaded",
          deliveryMethod: "Download",
          planType: duration,
          createdBy: creatorEmail,
          mobile: quotationData.mobile || null,
          designation: quotationData.designation || null,
          address: quotationData.address || null,
          pincode: quotationData.pincode || null,
          city: quotationData.city || null,
          country: quotationData.country || null,
          gstNumber: quotationData.gstNumber || null,
          userCategory: quotationData.userCategory || null,
          discountAmount: quotationData.discountAmount ? parseFloat(quotationData.discountAmount) : 0,
          couponCode: quotationData.couponCode || null
        },
        create: {
          issuer: currentIssuer(),
          id: quotationNumber,
          userEmail,
          userName,
          organization: organization || null,
          state: state || null,
          items: quotationData.items || [],
          subtotal: parseFloat(quotationData.subtotal) || 0,
          gstAmount: parseFloat(quotationData.gstAmount) || 0,
          total: parseFloat(quotationData.totalAmount?.toString().replace(/,/g, '')) || 0,
          status: "Downloaded",
          deliveryMethod: "Download",
          planType: duration,
          userId: userId || null,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          createdBy: creatorEmail,
          discountAmount: quotationData.discountAmount ? parseFloat(quotationData.discountAmount) : 0,
          couponCode: quotationData.couponCode || null,
          mobile: quotationData.mobile || null,
          designation: quotationData.designation || null,
          address: quotationData.address || null,
          pincode: quotationData.pincode || null,
          city: quotationData.city || null,
          country: quotationData.country || null,
          gstNumber: quotationData.gstNumber || null,
          userCategory: quotationData.userCategory || null
        }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Save Quotation Error:", error);
      res.status(500).json({ error: "Failed to save quotation" });
    }
  });

  // Send Quotation Email
  app.post("/api/quotation/send", authenticateJWT, requireSalesRole, async (req: any, res) => {
    try {
      const { userEmail, userName, quotationData, pdfBase64, userId, organization, state, duration, quotationDate } = req.body;
      
      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      const quotationNumber = quotationData.quotationNumber;
      const totalAmount = typeof quotationData.totalAmount === 'number'
        ? quotationData.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })
        : (quotationData.totalAmount || '0');

      // Read logo for CID inline attachment
      const logoPath = path.join(process.cwd(), 'public', 'assets', 'stm-logo.png');
      const logoExists = fs.existsSync(logoPath);

      // Build departments list from items
      const items: any[] = quotationData.items || [];
      const departmentNames: string[] = items.map((it: any) => it.domainName).filter(Boolean);
      const departmentsHtml = departmentNames.length
        ? departmentNames.map(d => `<li style="padding:4px 0;color:#1e293b;font-size:14px;">✅ &nbsp;${d}</li>`).join('')
        : '<li style="color:#94a3b8;font-size:14px;">—</li>';

      const issuedDate = quotationDate || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const subscriptionDuration = duration || (items[0]?.duration) || '—';

      const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Quotation — STM Digital Library</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;font-family:'Segoe UI',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef2f7;padding:32px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);max-width:620px;">

        <!-- ═══════════ HEADER ═══════════ -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a6e 100%);padding:32px 48px 28px;text-align:center;">
            ${logoExists
              ? `<img src="cid:stm-logo" alt="STM Digital Library" width="110" height="110" style="display:block;margin:0 auto 16px;border-radius:12px;" />`
              : `<div style="display:inline-block;background:#2563eb;border-radius:12px;padding:10px 22px;margin-bottom:16px;"><span style="color:#ffffff;font-size:18px;font-weight:900;letter-spacing:3px;">STM</span></div>`
            }
            <h1 style="color:#ffffff;margin:0 0 6px;font-size:26px;font-weight:900;letter-spacing:1px;line-height:1.2;">STM DIGITAL LIBRARY</h1>
            <p style="color:#93c5fd;margin:0 0 16px;font-size:13px;font-weight:500;letter-spacing:0.5px;">${COMPANY_DETAILS.positioning}</p>
            <span style="display:inline-block;background:#15803d;color:#ffffff;font-size:11px;font-weight:700;border-radius:30px;padding:6px 20px;letter-spacing:1px;">
              🏆 &nbsp;21 Years of Trusted Excellence in Education &amp; Academic Publishing
            </span>
          </td>
        </tr>

        <!-- ═══════════ GREETING ═══════════ -->
        <tr>
          <td style="padding:36px 48px 0;">
            <p style="font-size:16px;color:#1e293b;margin:0 0 6px;font-weight:600;">Dear ${userName},</p>
            <p style="font-size:14px;color:#475569;line-height:1.75;margin:0 0 20px;">
              Greetings from <strong>STM Digital Library</strong>!<br/>
              Thank you for your interest in our digital library subscription services.<br/>
              Please find attached the quotation for the selected department(s) and subscription duration.
            </p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 28px;"/>
          </td>
        </tr>

        <!-- ═══════════ QUOTATION DETAILS ═══════════ -->
        <tr>
          <td style="padding:0 48px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1d4ed8,#1e40af);border-radius:14px;overflow:hidden;">
              <tr>
                <td style="padding:20px 28px 10px;">
                  <p style="color:#bfdbfe;font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;margin:0 0 18px;">📄 &nbsp;Quotation Details</p>

                  <!-- Row -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="color:#93c5fd;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);width:55%;">Quotation Number</td>
                      <td style="color:#ffffff;font-size:13px;font-weight:700;text-align:right;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);">${quotationNumber}</td>
                    </tr>
                    <tr>
                      <td style="color:#93c5fd;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);">Quotation Date</td>
                      <td style="color:#ffffff;font-size:13px;font-weight:600;text-align:right;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);">${issuedDate}</td>
                    </tr>
                    <tr>
                      <td style="color:#93c5fd;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);">Subscription Validity</td>
                      <td style="color:#86efac;font-size:13px;font-weight:600;text-align:right;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);">30 Days from Issue</td>
                    </tr>
                    <tr>
                      <td style="color:#93c5fd;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);">Subscription Duration</td>
                      <td style="color:#ffffff;font-size:13px;font-weight:600;text-align:right;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);">${subscriptionDuration}</td>
                    </tr>
                  </table>

                  <!-- Departments -->
                  <p style="color:#93c5fd;font-size:12px;margin:14px 0 6px;">Selected Department(s)</p>
                  <ul style="margin:0 0 14px;padding-left:4px;list-style:none;">
                    ${departmentsHtml}
                  </ul>
                  ${quotationData.discountAmount ? `
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
                    <tr>
                      <td style="color:#86efac;font-size:13px;font-weight:600;padding-bottom:6px;">Discount (${quotationData.couponCode})</td>
                      <td style="text-align:right;color:#86efac;font-size:13px;font-weight:700;padding-bottom:6px;">-₹${quotationData.discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  </table>
                  ` : ''}

                  <!-- Grand Total -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(255,255,255,0.25);padding-top:14px;margin-top:4px;">
                    <tr>
                      <td style="color:#bfdbfe;font-size:13px;font-weight:600;padding-top:14px;">Total Amount (Including 18% GST)</td>
                      <td style="text-align:right;padding-top:14px;">
                        <span style="color:#ffffff;font-size:22px;font-weight:900;">₹${totalAmount}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ═══════════ ABOUT STM ═══════════ -->
        <tr>
          <td style="padding:0 48px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border-radius:14px;border:1px solid #bae6fd;">
              <tr>
                <td style="padding:22px 28px;">
                  <p style="color:#0369a1;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 14px;">📚 &nbsp;About STM Digital Library</p>
                  <p style="color:#475569;font-size:13px;margin:0 0 12px;line-height:1.7;">STM Digital Library is a curated academic platform providing access to:</p>
                  <table cellpadding="0" cellspacing="0">
                    <tr><td style="padding:3px 0;color:#1e293b;font-size:13px;">✦ &nbsp;Academic Journals</td></tr>
                    <tr><td style="padding:3px 0;color:#1e293b;font-size:13px;">✦ &nbsp;Conference Proceedings</td></tr>
                    <tr><td style="padding:3px 0;color:#1e293b;font-size:13px;">✦ &nbsp;Educational Videos</td></tr>
                    <tr><td style="padding:3px 0;color:#1e293b;font-size:13px;">✦ &nbsp;E-books &amp; Reference Materials</td></tr>
                    <tr><td style="padding:3px 0;color:#1e293b;font-size:13px;">✦ &nbsp;Theses &amp; Research Content</td></tr>
                    <tr><td style="padding:3px 0;color:#1e293b;font-size:13px;">✦ &nbsp;Legally sourced open-access academic resources</td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ═══════════ PAYMENT INFO ═══════════ -->
        <tr>
          <td style="padding:0 48px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fefce8;border-radius:14px;border:1px solid #fde68a;">
              <tr>
                <td style="padding:22px 28px;">
                  <p style="color:#92400e;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 14px;">💳 &nbsp;Payment Information</p>
                  <p style="color:#78350f;font-size:13px;font-weight:600;margin:0 0 12px;">Payments must be made only to:</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="color:#92400e;font-size:12px;padding:5px 0;border-bottom:1px solid #fde68a;width:45%;">Account Name</td>
                      <td style="color:#1e293b;font-size:13px;font-weight:700;padding:5px 0;border-bottom:1px solid #fde68a;">${COMPANY_DETAILS.legalName}</td>
                    </tr>
                    <tr>
                      <td style="color:#92400e;font-size:12px;padding:5px 0;border-bottom:1px solid #fde68a;">Account Number</td>
                      <td style="color:#1e293b;font-size:13px;font-weight:700;padding:5px 0;border-bottom:1px solid #fde68a;">${COMPANY_DETAILS.bank.accountNumber}</td>
                    </tr>
                    <tr>
                      <td style="color:#92400e;font-size:12px;padding:5px 0;border-bottom:1px solid #fde68a;">Bank Name</td>
                      <td style="color:#1e293b;font-size:13px;font-weight:700;padding:5px 0;border-bottom:1px solid #fde68a;">${COMPANY_DETAILS.bank.bankName}</td>
                    </tr>
                    <tr>
                      <td style="color:#92400e;font-size:12px;padding:5px 0;border-bottom:1px solid #fde68a;">Branch</td>
                      <td style="color:#1e293b;font-size:13px;font-weight:600;padding:5px 0;border-bottom:1px solid #fde68a;">${COMPANY_DETAILS.bank.branch}</td>
                    </tr>
                    <tr>
                      <td style="color:#92400e;font-size:12px;padding:5px 0;">IFSC Code</td>
                      <td style="color:#1e293b;font-size:13px;font-weight:700;padding:5px 0;">${COMPANY_DETAILS.bank.ifscCode}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ═══════════ CONTACT INFO ═══════════ -->
        <tr>
          <td style="padding:0 48px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:14px;border:1px solid #bbf7d0;">
              <tr>
                <td style="padding:22px 28px;">
                  <p style="color:#15803d;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 14px;">📞 &nbsp;Contact Information</p>
                  <p style="color:#166534;font-size:13px;font-weight:500;margin:0 0 10px;">For any assistance regarding subscription, quotation, or payment:</p>
                  <table cellpadding="0" cellspacing="4">
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#1e293b;">
                        📧 &nbsp;<a href="mailto:${COMPANY_DETAILS.email}" style="color:#2563eb;text-decoration:none;font-weight:600;">${COMPANY_DETAILS.email}</a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#1e293b;">
                        📞 &nbsp;<a href="tel:+919810078958" style="color:#1e293b;text-decoration:none;font-weight:600;">+91-9810078958</a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#1e293b;">
                        🌐 &nbsp;<a href="https://journalslibrary.com/" style="color:#2563eb;text-decoration:none;font-weight:600;">journalslibrary.com</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ═══════════ SIGNATURE ═══════════ -->
        <tr>
          <td style="padding:0 48px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #e2e8f0;padding-top:24px;">
              <tr>
                <td style="padding-top:20px;">
                  <p style="color:#475569;font-size:14px;margin:0 0 4px;">Warm regards,</p>
                  <p style="color:#1e293b;font-size:15px;font-weight:700;margin:0 0 2px;">STM Digital Library Team</p>
                  <p style="color:#64748b;font-size:12px;margin:0;">${COMPANY_DETAILS.legalName}</p>
                  <p style="color:#64748b;font-size:12px;margin:4px 0 0;">A-118, 1st Floor, Sector-63, Noida - 201301, U.P., India</p>
                </td>
                <td style="text-align:right;vertical-align:bottom;padding-top:20px;">
                  <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 4px;">For Publisher</p>
                  <p style="color:#1e293b;font-size:13px;font-weight:700;margin:0 0 4px;">STM Digital Library</p>
                  <p style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin:0;">Authorized Signatory</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ═══════════ FOOTER ═══════════ -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a6e 100%);padding:28px 48px;text-align:center;">
            <p style="color:#f8fafc;font-size:13px;font-weight:700;margin:0 0 6px;letter-spacing:0.5px;">
              🏆 &nbsp;21 Years of Trusted Excellence in Education &amp; Academic Publishing
            </p>
            <p style="color:#64748b;font-size:11px;margin:0 0 4px;">
              © ${new Date().getFullYear()} ${COMPANY_DETAILS.legalName} All rights reserved.
            </p>
            <p style="color:#475569;font-size:11px;margin:0;">
              GSTIN: ${COMPANY_DETAILS.gstin} &nbsp;|&nbsp; PAN: ${COMPANY_DETAILS.pan} &nbsp;|&nbsp; CIN: ${COMPANY_DETAILS.cin}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const inlineAttachments: any[] = [
        {
          filename: `Quotation_${quotationNumber}.pdf`,
          content: pdfBase64,
          encoding: 'base64'
        }
      ];
      if (logoExists) {
        inlineAttachments.push({
          filename: 'stm-logo.png',
          path: logoPath,
          cid: 'stm-logo'  // Referenced as cid:stm-logo in the HTML
        });
      }

      const mailOptions = {
        from: `"STM Digital Library" <${emailFrom}>`,
        to: [userEmail, process.env.ADMIN_EMAIL || COMPANY_DETAILS.email],
        subject: `Quotation ${quotationNumber} — STM Digital Library`,
        html: htmlBody,
        attachments: inlineAttachments
      };
      await sendMail(mailOptions);

      // Respond immediately after email is sent — DB save is non-blocking
      res.json({ status: "success", message: "Quotation sent successfully" });

      // Parse optional token to find creator
      let creatorEmail = req.body.createdBy || 'System / Guest';
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        try {
          const jwt = require("jsonwebtoken");
          const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";
          const decoded = jwt.verify(token, JWT_SECRET);
          if (decoded && decoded.email) creatorEmail = decoded.email;
        } catch(e) {}
      }

      // Save to PostgreSQL (fire-and-forget, never blocks the response)
      // Replace cid:stm-logo with a public URL so it renders in browser previews
      const PUBLIC_BASE = process.env.APP_URL || 'https://journals.stmjournals.com';
      const htmlForDb = htmlBody.replace(
        /src="cid:stm-logo"/g,
        `src="${PUBLIC_BASE}/assets/stm-logo.png"`
      );
      prisma.quotation.upsert({
        where: { id: quotationNumber },
        update: { 
          status: "Sent",
          deliveryMethod: "Email",
          sentEmailHtml: htmlForDb,
          planType: subscriptionDuration,
          createdBy: creatorEmail,
          discountAmount: quotationData.discountAmount ? parseFloat(quotationData.discountAmount) : 0,
          couponCode: quotationData.couponCode || null,
          mobile: quotationData.mobile || null,
          designation: quotationData.designation || null,
          address: quotationData.address || null,
          pincode: quotationData.pincode || null,
          city: quotationData.city || null,
          country: quotationData.country || null,
          gstNumber: quotationData.gstNumber || null,
          userCategory: quotationData.userCategory || null
        },
        create: {
          issuer: currentIssuer(),
          id: quotationNumber,
          userEmail,
          userName,
          organization: organization || null,
          state: state || null,
          items: quotationData.items || [],
          subtotal: parseFloat(quotationData.subtotal) || 0,
          gstAmount: parseFloat(quotationData.gstAmount) || 0,
          total: parseFloat(quotationData.totalAmount?.toString().replace(/,/g, '')) || 0,
          status: "Sent",
          deliveryMethod: "Email",
          planType: subscriptionDuration,
          userId: userId || null,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          sentEmailHtml: htmlForDb,
          createdBy: creatorEmail,
          discountAmount: quotationData.discountAmount ? parseFloat(quotationData.discountAmount) : 0,
          couponCode: quotationData.couponCode || null,
          mobile: quotationData.mobile || null,
          designation: quotationData.designation || null,
          address: quotationData.address || null,
          pincode: quotationData.pincode || null,
          city: quotationData.city || null,
          country: quotationData.country || null,
          gstNumber: quotationData.gstNumber || null,
          userCategory: quotationData.userCategory || null
        }
      }).then(async (qtn) => {
        if (quotationData.couponCode && quotationData.discountAmount > 0) {
          const coupon = await prisma.coupon.findUnique({ where: { code: quotationData.couponCode } });
          if (coupon) {
            await prisma.couponUsage.create({
              data: {
                couponId: coupon.id,
                userId: userId || null,
                orderId: quotationNumber,
                discount: parseFloat(quotationData.discountAmount)
              }
            });
            await prisma.coupon.update({
              where: { id: coupon.id },
              data: { usedCount: { increment: 1 } }
            });
          }
        }
      }).catch((dbErr: any) => {
        console.warn("Quotation DB save failed (non-blocking):", dbErr?.message);
      });

    } catch (error) {
      console.error("Quotation Email Error:", error);
      res.status(500).json({ error: "Failed to send quotation email" });
    }
  });

  // Send Invoice Email
  app.post("/api/invoice/send", async (req, res) => {
    try {
      const { userEmail, userName, invoiceData, pdfBase64, items, paymentId, orderId } = req.body;
      
      const emailSent = await sendPaymentSuccessEmails(
        userEmail,
        userName,
        invoiceData.grandTotal,
        items || [],
        paymentId || '',
        orderId || '',
        invoiceData.invoiceNumber,
        pdfBase64
      );

      if (emailSent) {
        res.json({ status: "success", message: "Invoice sent successfully" });
      } else {
        res.status(500).json({ error: "Failed to send email notifications" });
      }
    } catch (error) {
      console.error("Invoice Email Error:", error);
      res.status(500).json({ error: "Failed to send invoice email" });
    }
  });

  // ==========================================
  // INSTITUTIONAL ROUTES
  // ==========================================
  app.get("/api/institution/stats", authenticateJWT, async (req: any, res) => {
    try {
      if (req.user.role !== 'Institution' && req.user.role !== 'SuperAdmin') return res.status(403).json({ error: "Unauthorized" });
      let targetInstitutionId = req.query.institutionId;
      if (req.user.role === 'Institution') {
         const userId = req.user.uid || req.user.id || req.user.userId;
         const authUser = await (prisma as any).user.findUnique({ where: { id: userId } });
         targetInstitutionId = authUser?.institutionId;
      }

      // Without a resolved institution, an undefined filter would match every institution's data.
      if (!targetInstitutionId) {
        return res.json({ studentCount: 0, activeGrants: 0, totalInteractions: 0, avgLearningTime: '0h 0m', recentActivity: [] });
      }

      const studentCount = await prisma.user.count({ where: { institutionId: targetInstitutionId, role: "Student" } });
      const recentActivity = await prisma.studentActivity.findMany({ 
        where: { user: { institutionId: targetInstitutionId } }, 
        include: { user: true, content: true },
        take: 5,
        orderBy: { accessedAt: 'desc' }
      });
      
      // Calculate abstract mock analytics
      const interactions = await prisma.studentActivity.count({ where: { user: { institutionId: targetInstitutionId } } });
      const totalTimeObj = await prisma.studentActivity.aggregate({
        _sum: { timeSpent: true },
        where: { user: { institutionId: targetInstitutionId } }
      });
      const totalMins = totalTimeObj._sum.timeSpent || 0;
      let avgLearningTimeStr = '0h 0m';
      if (studentCount > 0 && totalMins > 0) {
        const avg = Math.floor(totalMins / studentCount);
        avgLearningTimeStr = `${Math.floor(avg / 60)}h ${avg % 60}m`;
      }
      
      res.json({ studentCount, activeGrants: studentCount, totalInteractions: interactions, avgLearningTime: avgLearningTimeStr, recentActivity });
    } catch(err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // GET /api/institution/analytics
  app.get("/api/institution/analytics", authenticateJWT, async (req: any, res) => {
    try {
      if (req.user.role !== 'Institution' && req.user.role !== 'SuperAdmin') return res.status(403).json({ error: "Unauthorized" });
      let targetInstitutionId = req.query.institutionId;
      if (req.user.role === 'Institution') {
         const userId = req.user.uid || req.user.id || req.user.userId;
         const authUser = await (prisma as any).user.findUnique({ where: { id: userId } });
         targetInstitutionId = authUser?.institutionId;
      }

      // Without a resolved institution, an undefined filter would match every institution's data.
      if (!targetInstitutionId) {
        return res.json({ totalStudents: 0, starReader: null, readingTimeline: [], topContent: [], totalInteractions: 0 });
      }

      const students = await prisma.user.findMany({ where: { institutionId: targetInstitutionId, role: "Student" } });
      const activities = await prisma.studentActivity.findMany({
        where: { user: { institutionId: targetInstitutionId } },
        include: { user: true, content: true }
      });

      // Star Reader
      const userActivityMap = new Map();
      activities.forEach(a => {
        if (!a.user) return; // Skip if user is deleted
        const current = userActivityMap.get(a.userId) || { count: 0, timeSpent: 0, user: a.user };
        current.count += 1;
        current.timeSpent += a.timeSpent || 0;
        userActivityMap.set(a.userId, current);
      });
      let starReader = null;
      let maxInteractions = 0;
      userActivityMap.forEach(val => {
        if (val.count > maxInteractions) {
          maxInteractions = val.count;
          starReader = {
            name: val.user?.displayName || val.user?.email || 'Unknown',
            interactions: val.count,
            timeSpent: val.timeSpent
          };
        }
      });

      // Daily reading stats mock
      const today = new Date();
      const readingTimeline = Array.from({length: 7}).map((_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (6 - i));
        return {
          date: d.toLocaleDateString('en-US', { weekday: 'short' }),
          students: Math.floor(Math.random() * (students.length > 0 ? students.length : 10)) + 1,
          interactions: Math.floor(Math.random() * 50) + 5
        };
      });

      // Most read content
      const contentMap = new Map();
      activities.forEach(a => {
        if (!a.contentId) return;
        const current = contentMap.get(a.contentId) || { count: 0, content: a.content };
        current.count += 1;
        contentMap.set(a.contentId, current);
      });
      const topContent = Array.from(contentMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(c => ({
          title: c.content?.title || 'Unknown',
          type: c.content?.contentType || 'Book',
          reads: c.count
        }));

      res.json({
        totalStudents: students.length,
        starReader,
        readingTimeline,
        topContent,
        totalInteractions: activities.length
      });
    } catch(err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // GET /api/institution/subscriptions — subscriptions for this institution user
  app.get("/api/institution/subscriptions", authenticateJWT, async (req: any, res) => {
    try {
      if (req.user.role !== 'Institution' && req.user.role !== 'SuperAdmin') {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const userId = req.user.uid || req.user.id || req.user.userId;
      const OR_clauses: any[] = [{ userId: userId }];
      
      // institutionId is stored on the User record and embedded in JWT at login
      let instId = req.user.institutionId;
      if (!instId) {
        // Fallback: load from DB for older tokens
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { institutionId: true } });
        instId = u?.institutionId;
      }
      if (instId) {
        OR_clauses.push({ institutionId: instId });
      }

      const subscriptions = await prisma.subscription.findMany({
        where: { OR: OR_clauses },
        orderBy: { startDate: 'desc' }
      });
      res.json(subscriptions);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch subscriptions" });
    }
  });

  // GET /api/institution/profile — return editable profile fields
  app.get("/api/institution/profile", authenticateJWT, async (req: any, res) => {
    try {
      if (req.user.role !== 'Institution' && req.user.role !== 'SuperAdmin') {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const userId = req.user.uid || req.user.id || req.user.userId;
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: "User not found" });
      const prof = (user as any).institutionProfile || {};
      res.json({
        institutionName: user.organization,   // read-only
        contactName: user.displayName,
        state: user.state,                    // repurposed as city for now
        // Extended fields live in user metadata
        contactPhone: prof.contactPhone || '',
        address: prof.address || '',
        city: user.state || prof.city || '',
        website: prof.website || '',
        logoUrl: prof.logoUrl || '',
        coursesOffered: prof.coursesOffered || '',
        totalCourses: prof.totalCourses || '',
        studentBodySize: prof.studentBodySize || '',
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to load profile" });
    }
  });

  // PUT /api/institution/profile — update editable fields (institutionName is NOT writable)
  app.put("/api/institution/profile", authenticateJWT, async (req: any, res) => {
    try {
      if (req.user.role !== 'Institution' && req.user.role !== 'SuperAdmin') {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const { contactName, city, contactPhone, address, website, logoUrl, coursesOffered, totalCourses, studentBodySize } = req.body;
      // institutionName (organization) is intentionally EXCLUDED from updates here
      const userId = req.user.uid || req.user.id || req.user.userId;
      await prisma.user.update({
        where: { id: userId },
        data: {
          ...(contactName ? { displayName: contactName } : {}),
          ...(city ? { state: city } : {}),
          institutionProfile: {
            contactPhone, address, city, website, logoUrl, coursesOffered, totalCourses, studentBodySize
          } as any
        }
      });
      res.json({ message: "Profile updated successfully" });
    } catch (err) {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });



  /**
   * Which institution a student is being created into.
   *
   * This used to be left undefined whenever it could not be resolved, so the
   * student was created with no institution link and then never appeared in the
   * list — which filters by institutionId. Silent orphaning is worse than a
   * refusal, so this returns an error string instead of a blank.
   */
  const resolveTargetInstitution = async (req: any): Promise<{ id?: string; name: string; error?: string }> => {
    if (req.user.role === 'Institution') {
      const me = await (prisma as any).user.findUnique({
        where: { id: req.user.uid || req.user.id || req.user.userId },
        select: { organization: true, institutionId: true },
      });
      if (!me?.institutionId) {
        return { name: '', error: 'Your account is not linked to an institution yet. Ask an administrator to link it before adding students.' };
      }
      return { id: me.institutionId, name: me.organization || '' };
    }

    // SuperAdmin must say which institution they are adding into.
    const explicit = req.body?.institutionId || req.query?.institutionId;
    if (!explicit) {
      return { name: '', error: 'institutionId is required when adding students as an administrator.' };
    }
    const inst = await (prisma as any).institution.findUnique({ where: { id: explicit }, select: { name: true } });
    if (!inst) return { name: '', error: 'That institution does not exist.' };
    return { id: explicit, name: inst.name || '' };
  };

  app.get("/api/institution/students", authenticateJWT, async (req: any, res) => {
    try {
      if (req.user.role !== 'Institution' && req.user.role !== 'SuperAdmin') return res.status(403).json({ error: "Unauthorized" });
      
      let targetInstitutionId = req.query.institutionId;
      if (req.user.role === 'Institution') {
         const userId = req.user.uid || req.user.id || req.user.userId;
         const authUser = await (prisma as any).user.findUnique({ where: { id: userId } });
         targetInstitutionId = authUser?.institutionId;
      }

      if (!targetInstitutionId) {
        return res.json([]);
      }

      const students = await (prisma as any).user.findMany({
        where: { institutionId: targetInstitutionId, role: 'Student' },
        include: { subscriptions: true, activities: { include: { content: true } } },
        orderBy: { createdAt: 'desc' }
      });
      res.json(students);
    } catch(err) {
      res.status(500).json({ error: "Failed to fetch students" });
    }
  });

  app.post("/api/institution/students", authenticateJWT, async (req: any, res) => {
    try {
      if (req.user.role !== 'Institution' && req.user.role !== 'SuperAdmin') {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const { name, email, password, mobile, designation, branch, department } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email and password are required" });
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return res.status(409).json({ error: "A user with this email already exists" });

      const hashed = await bcrypt.hash(password, 10);

      const target = await resolveTargetInstitution(req);
      if (target.error) return res.status(400).json({ error: target.error });
      const institutionName = target.name;
      const targetInstitutionId = target.id;

      const student = await (prisma as any).user.create({
        data: {
          email,
          password: hashed,
          displayName: name,
          role: 'Student', // Preserve existing logic
          contact: mobile || null,
          designation: designation || 'Student',
          organization: institutionName,
          institutionId: targetInstitutionId,
          institutionProfile: {
            branch: branch || '',
            department: department || ''
          }
        }
      });
      const { password: _, ...safe } = student;
      res.json(safe);
    } catch(err: any) {
      console.error('POST /api/institution/students error:', err?.message);
      res.status(500).json({ error: "Failed to create student", detail: err?.message });
    }
  });

  // POST /api/institution/students/bulk — Bulk import users via JSON array
  app.post("/api/institution/students/bulk", authenticateJWT, async (req: any, res) => {
    try {
      if (req.user.role !== 'Institution' && req.user.role !== 'SuperAdmin') {
        return res.status(403).json({ error: "Unauthorized" });
      }
      
      const { users } = req.body;
      if (!Array.isArray(users) || users.length === 0) {
        return res.status(400).json({ error: "A valid array of users is required" });
      }

      const target = await resolveTargetInstitution(req);
      if (target.error) return res.status(400).json({ error: target.error });
      const institutionName = target.name;
      const targetInstitutionId = target.id;

      let successCount = 0;
      let errorCount = 0;
      const errors = [];

      for (const u of users) {
        try {
          if (!u.email || !u.name || !u.password) {
            errorCount++;
            errors.push({ email: u.email || 'Unknown', error: 'Missing required fields' });
            continue;
          }

          const existing = await prisma.user.findUnique({ where: { email: u.email } });
          if (existing) {
            errorCount++;
            errors.push({ email: u.email, error: 'Email already exists' });
            continue;
          }

          const hashed = await bcrypt.hash(u.password, 10);
          await (prisma as any).user.create({
            data: {
              email: u.email,
              password: hashed,
              displayName: u.name,
              role: 'Student', // Preserve existing logic
              contact: u.mobile || null,
              designation: u.designation || 'Student',
              organization: institutionName,
              institutionId: targetInstitutionId,
              institutionProfile: {
                branch: u.branch || '',
                department: u.department || ''
              }
            }
          });
          successCount++;
        } catch (err: any) {
          errorCount++;
          errors.push({ email: u.email, error: err.message });
        }
      }

      res.json({ successCount, errorCount, errors });
    } catch(err: any) {
      console.error('POST /api/institution/students/bulk error:', err?.message);
      res.status(500).json({ error: "Failed to process bulk import", detail: err?.message });
    }
  });
  app.post("/api/institution/students/:id/block", authenticateJWT, async (req: any, res) => {
    try {
      if (req.user.role !== 'Institution' && req.user.role !== 'SuperAdmin') return res.status(403).json({ error: "Unauthorized" });

      const { id } = req.params;
      const { isBlocked } = req.body;

      // An Institution may only affect students belonging to its own institution.
      if (req.user.role === 'Institution') {
        const callerId = req.user.uid || req.user.id || req.user.userId;
        const caller = await (prisma as any).user.findUnique({ where: { id: callerId } });
        const target = await prisma.user.findUnique({ where: { id } });
        if (!target) return res.status(404).json({ error: "Student not found" });
        if (!caller?.institutionId || target.institutionId !== caller.institutionId) {
          return res.status(403).json({ error: "Not your student" });
        }
      }

      const student = await prisma.user.update({
        where: { id },
        data: { isBlocked }
      });
      res.json(student);
    } catch(err) {
      res.status(500).json({ error: "Failed to block student" });
    }
  });

  // PUT /api/institution/students/:id — update student name/email
  app.put("/api/institution/students/:id", authenticateJWT, async (req: any, res) => {
    try {
      if (req.user.role !== 'Institution' && req.user.role !== 'SuperAdmin') {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const { id } = req.params;
      const { displayName, email, contact, designation, branch, department, password } = req.body;

      if (email) {
        const taken = await prisma.user.findFirst({ where: { email, id: { not: id } } });
        if (taken) return res.status(409).json({ error: "Email already in use" });
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "User not found" });

      // An Institution may only modify students belonging to its own institution.
      if (req.user.role === 'Institution') {
        const callerId = req.user.uid || req.user.id || req.user.userId;
        const caller = await (prisma as any).user.findUnique({ where: { id: callerId } });
        if (!caller?.institutionId || existing.institutionId !== caller.institutionId) {
          return res.status(403).json({ error: "Not your student" });
        }
      }

      let newInstitutionProfile = (existing.institutionProfile as any) || {};
      if (branch !== undefined) newInstitutionProfile.branch = branch;
      if (department !== undefined) newInstitutionProfile.department = department;

      let dataToUpdate: any = {
        ...(displayName ? { displayName } : {}),
        ...(email ? { email } : {}),
        ...(contact !== undefined ? { contact } : {}),
        ...(designation !== undefined ? { designation } : {}),
        institutionProfile: newInstitutionProfile
      };

      if (password && password.trim() !== '') {
        dataToUpdate.password = await bcrypt.hash(password, 10);
      }

      const updated = await prisma.user.update({
        where: { id },
        data: dataToUpdate
      });
      const { password: _, ...profile } = updated;
      res.json({ user: profile });
    } catch (err) {
      res.status(500).json({ error: "Failed to update student" });
    }
  });

  // DELETE /api/institution/students/:id — remove student
  app.delete("/api/institution/students/:id", authenticateJWT, async (req: any, res) => {
    try {
      if (req.user.role !== 'Institution' && req.user.role !== 'SuperAdmin') {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const { id } = req.params;

      // An Institution may only delete students belonging to its own institution.
      if (req.user.role === 'Institution') {
        const callerId = req.user.uid || req.user.id || req.user.userId;
        const caller = await (prisma as any).user.findUnique({ where: { id: callerId } });
        const target = await prisma.user.findUnique({ where: { id } });
        if (!target) return res.status(404).json({ error: "Student not found" });
        if (!caller?.institutionId || target.institutionId !== caller.institutionId) {
          return res.status(403).json({ error: "Not your student" });
        }
      }

      await prisma.user.delete({ where: { id } });
      res.json({ message: "Student removed" });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete student" });
    }
  });

  // ==========================================
  // SYSTEM VALIDATOR (Data Hygiene)
  // ==========================================
  
  let currentValidationProgress: {
    isRunning: boolean;
    totalItems: number;
    scannedItems: number;
    issuesFound: number;
    currentTask: string;
    startedAt?: number;
  } = {
    isRunning: false,
    totalItems: 0,
    scannedItems: 0,
    issuesFound: 0,
    currentTask: "Idle"
  };

  const checkLink = async (url: string | null) => {
    if (!url || !url.startsWith("http")) return true; // Ignore null or relative
    try {
      new URL(url); // Ensure valid format
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };
      const res = await fetch(url, { method: "HEAD", headers, signal: controller.signal as any }).catch(() => null);
      clearTimeout(timeoutId);
      
      // Accept ok or any redirect (which means it's resolvable)
      if (res && res.status < 400) return true;
      
      // If HEAD fails (e.g. 403/405/bot-block), try GET minimally
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 6000);
      const resGet = await fetch(url, { method: "GET", headers, signal: controller2.signal as any }).catch(() => null);
      clearTimeout(timeoutId2);
      return resGet ? resGet.status < 400 : false;
    } catch {
      return false; // Connection forcibly closed, timed out, or unparseable
    }
  };

  // ── Concurrent link-check helper (batch of LINK_BATCH_SIZE) ───────────────
  const LINK_BATCH_SIZE = 100;

  const checkLinksBatch = async (
    items: Array<{ id: string; title: string; contentType: string; url: string; urlLabel: string }>
  ): Promise<any[]> => {
    const results: any[] = [];
    for (let i = 0; i < items.length; i += LINK_BATCH_SIZE) {
      const batch = items.slice(i, i + LINK_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          const isOk = await checkLink(item.url);
          if (!isOk) {
            return {
              contentId: item.id,
              title: item.title,
              contentType: item.contentType,
              issueType: "BrokenLink",
              description: `${item.urlLabel} is unreachable or forbidden: ${item.url}`
            };
          }
          return null;
        })
      );
      results.push(...batchResults.filter(Boolean));
    }
    return results;
  };

  const FILE_REQUIRED_TYPES = new Set(["Book", "Journal", "Conference Paper", "Video", "Periodical", "Report"]);

  const runValidationEngine = async (type: "Manual" | "Automatic") => {
    if (currentValidationProgress.isRunning) return;

    try {
      const contents = await prisma.content.findMany({
        where: { status: { not: "Draft" } },  // Skip already-drafted content — no point re-flagging it
        select: { id: true, title: true, description: true, authors: true, fileUrl: true, thumbnailUrl: true, domain: true, contentType: true }
      });

      currentValidationProgress = {
        isRunning: true,
        totalItems: contents.length,
        scannedItems: 0,
        issuesFound: 0,
        currentTask: "Initializing Engine...",
        startedAt: Date.now()
      };

      const report = await prisma.validationReport.create({
        data: { type, status: "Reviewing", issues: [] }
      });

      const issues: any[] = [];
      const titleDomainMap = new Map<string, string>();
      const urlMap = new Map<string, string>();
      const urlsToCheck: Array<{ id: string; title: string; contentType: string; url: string; urlLabel: string }> = [];

      // ── PASS 1: Fast synchronous checks ──────────────────────────────────────
      currentValidationProgress.currentTask = "Pass 1/2: Checking metadata & duplicates...";
      const dummyRegex = /^(test|test title)$|\b(dummy|lorem ipsum|placeholder)\b/i;

      for (const c of contents) {
        currentValidationProgress.scannedItems++;
        await new Promise(resolve => setImmediate(resolve));

        // Dummy / placeholder data
        if (dummyRegex.test(c.title) || (c.description && dummyRegex.test(c.description))) {
          issues.push({ contentId: c.id, title: c.title, contentType: c.contentType, issueType: "DummyData", description: "Contains suspicious dummy/placeholder text in title or description." });
        }

        // Missing required metadata
        const needsFile = FILE_REQUIRED_TYPES.has(c.contentType);
        if (needsFile && (!c.fileUrl || c.fileUrl.trim().length === 0)) {
          issues.push({ contentId: c.id, title: c.title, contentType: c.contentType, issueType: "MissingMetadata", description: `A "${c.contentType}" is expected to have a file URL but none is set.` });
        }
        if (!c.authors || c.authors.trim().length === 0 || c.authors.toLowerCase() === 'unknown') {
          issues.push({ contentId: c.id, title: c.title, contentType: c.contentType, issueType: "MissingMetadata", description: "Author field is empty or set to 'Unknown'." });
        }

        // Duplicate title within domain
        const compositeKey = `${c.title.toLowerCase().trim()}-${(c.domain || '').toLowerCase()}`;
        if (titleDomainMap.has(compositeKey)) {
          issues.push({ contentId: c.id, title: c.title, contentType: c.contentType, issueType: "DuplicateTitle", description: "Title matches another entry within the same domain." });
        } else {
          titleDomainMap.set(compositeKey, c.id);
        }

        // Duplicate file URL
        if (c.fileUrl && c.fileUrl.trim().length > 0) {
          if (urlMap.has(c.fileUrl)) {
            issues.push({ contentId: c.id, title: c.title, contentType: c.contentType, issueType: "DuplicateFile", description: "File URL matches another active entry — possible duplicate upload." });
          } else {
            urlMap.set(c.fileUrl, c.id);
          }
        }

        // Collect HTTP URLs for batch link checking
        if (c.fileUrl && c.fileUrl.startsWith('http')) {
          urlsToCheck.push({ id: c.id, title: c.title, contentType: c.contentType, url: c.fileUrl, urlLabel: "File URL" });
        }
        if (c.thumbnailUrl && c.thumbnailUrl.startsWith('http')) {
          urlsToCheck.push({ id: c.id, title: c.title, contentType: c.contentType, url: c.thumbnailUrl, urlLabel: "Thumbnail URL" });
        }

        currentValidationProgress.issuesFound = issues.length;
      }

      // ── PASS 2: Concurrent link validation ───────────────────────────────────
      if (urlsToCheck.length > 0) {
        currentValidationProgress.currentTask = `Pass 2/2: Checking ${urlsToCheck.length} URLs (${LINK_BATCH_SIZE} at a time)...`;
        const linkIssues = await checkLinksBatch(urlsToCheck);
        issues.push(...linkIssues);
        currentValidationProgress.issuesFound = issues.length;
      }

      currentValidationProgress.currentTask = "Saving report...";

      await prisma.validationReport.update({
        where: { id: report.id },
        data: {
          status: "Draft",
          totalItemsScanned: contents.length,
          issuesFound: issues.length,
          issues,
          completedAt: new Date()
        }
      });
    } catch (e) {
      console.error("Validation engine crashed: ", e);
    } finally {
      currentValidationProgress.isRunning = false;
      currentValidationProgress.currentTask = "Idle";
      currentValidationProgress.startedAt = undefined;
    }
  };

  // Cron schedule: Run on the 1st of every month at midnight
  cron.schedule("0 0 1 * *", () => {
    console.log("Running scheduled System Validation...");
    runValidationEngine("Automatic").catch(err => console.error("Validation error:", err));
  });

  // Endpoints
  app.get("/api/admin/validator/progress", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    res.json(currentValidationProgress);
  });

  // POST /api/admin/validator/draft-content
  app.post("/api/admin/validator/draft-content", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { contentIds, reportId } = req.body;
      if (!contentIds || !Array.isArray(contentIds)) return res.status(400).json({ error: "Invalid contentIds array" });

      // 1. Bulk-update content status to Draft
      await prisma.content.updateMany({
        where: { id: { in: contentIds } },
        data: { status: "Draft" }
      });

      // 2. Persist drafted IDs + audit event on the report
      if (reportId) {
        const report = await prisma.validationReport.findUnique({ where: { id: reportId } });
        if (report) {
          const existingDrafted: string[] = Array.isArray(report.draftedContentIds) ? (report.draftedContentIds as string[]) : [];
          const merged = Array.from(new Set([...existingDrafted, ...contentIds]));
          const tl: any[] = Array.isArray(report.timeline) ? (report.timeline as any[]) : [];
          const actor = (req.user as any)?.email || (req.user as any)?.name || 'Admin';
          tl.push({
            action: 'drafted',
            by: actor,
            at: new Date().toISOString(),
            count: contentIds.length,
            note: `${contentIds.length} item(s) moved to Draft status.`
          });
          await prisma.validationReport.update({
            where: { id: reportId },
            data: { draftedContentIds: merged, timeline: tl }
          });
        }
      }

      res.json({ message: "Content items successfully drafted.", draftedCount: contentIds.length });
    } catch (error) {
      console.error("Draft Error:", error);
      res.status(500).json({ error: "Failed to draft content" });
    }
  });

  // GET /api/admin/validator/reports
  app.get("/api/admin/validator/reports", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const reports = await prisma.validationReport.findMany({ orderBy: { startedAt: "desc" } });
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch validation reports" });
    }
  });

  // POST /api/admin/validator/run
  app.post("/api/admin/validator/run", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    if (currentValidationProgress.isRunning) return res.status(400).json({ error: "Validation is already running." });
    
    try {
      res.json({ message: "Validation triggered successfully. It will run in the background." });
      // Run async
      runValidationEngine("Manual").catch(err => console.error("Manual validation error:", err));
    } catch (error) {
      res.status(500).json({ error: "Failed to run validator" });
    }
  });

  // PUT /api/admin/validator/reports/:id
  app.put("/api/admin/validator/reports/:id", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const report = await prisma.validationReport.findUnique({ where: { id } });
      if (!report) return res.status(404).json({ error: "Report not found" });

      const tl: any[] = Array.isArray(report.timeline) ? (report.timeline as any[]) : [];
      const actor = (req.user as any)?.email || (req.user as any)?.name || 'Admin';
      tl.push({
        action: 'status_changed',
        by: actor,
        at: new Date().toISOString(),
        note: `Status changed to "${status}".`
      });

      const updated = await prisma.validationReport.update({
        where: { id },
        data: { status, timeline: tl }
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update report status" });
    }
  });

  // DELETE /api/admin/validator/reports/:id
  app.delete("/api/admin/validator/reports/:id", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      await prisma.validationReport.delete({ where: { id } });
      res.json({ message: "Report deleted successfully." });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete report" });
    }
  });

  // ==========================================
  // VIEWER-BASED VALIDATION ENGINE
  // ==========================================

  let currentViewerValidationProgress: {
    isRunning: boolean;
    totalItems: number;
    scannedItems: number;
    validCount: number;
    flaggedCount: number;
    currentTask: string;
    startedAt?: number;
  } = {
    isRunning: false,
    totalItems: 0,
    scannedItems: 0,
    validCount: 0,
    flaggedCount: 0,
    currentTask: "Idle",
  };

  // ── Internal admin JWT for validator (short-lived, never exposed) ──────────
  const makeValidatorToken = () =>
    jwt.sign({ uid: "__validator__", role: "SuperAdmin" }, JWT_SECRET, { expiresIn: "10m" });

  // ── Per-file viewability check via PROXY (Option A + B) ──────────────────
  // Tests files the exact same way users open them, then verifies PDF structure.
  const validateFileViewability = async (
    contentId: string,
    url: string,
    contentType: string
  ): Promise<{ isViewable: boolean; viewerStatus: string; flaggedReason?: string }> => {
    // Step 0: No URL → instant fail
    if (!url || url.trim().length === 0) {
      return { isViewable: false, viewerStatus: "No File", flaggedReason: "No file URL is set for this content item." };
    }

    const lowerUrl = url.split("?")[0].toLowerCase();
    const isVideo = /\.(mp4|webm|ogg|avi|mov)$/i.test(lowerUrl);
    const isPdf =
      lowerUrl.endsWith(".pdf") ||
      lowerUrl.includes(".pdf") ||
      contentType.toLowerCase().includes("pdf") ||
      contentType.toLowerCase().includes("book") ||
      contentType.toLowerCase().includes("journal") ||
      contentType.toLowerCase().includes("report") ||
      contentType.toLowerCase().includes("periodical");

    // ── Step 1: Webpage URL pre-check ──────────────────────────────────────────
    // Detect URLs that are clearly webpage links, not direct file downloads.
    // These cannot be opened in a PDF viewer under any circumstances.
    const knownPagePatterns = [
      /archive\.org\/details\//i,
      /jstor\.org\/stable\//i,
      /doi\.org\//i,
      /pubmed\.ncbi\.nlm\.nih\.gov\//i,
      /researchgate\.net\/publication\//i,
      /sciencedirect\.com\/science\/article\//i,
      /springer\.com\/article\//i,
      /wiley\.com\/doi\//i,
      /tandfonline\.com\/doi\//i,
      /ncbi\.nlm\.nih\.gov\/pmc\/articles\//i,
    ];
    const hasFileExtension = /\.(pdf|mp4|webm|ogg|avi|mov|epub|djvu)(\?|$)/i.test(url);
    const isKnownPageUrl = knownPagePatterns.some(p => p.test(url));
    if (isKnownPageUrl && !hasFileExtension) {
      return {
        isViewable: false,
        viewerStatus: "Load Failed",
        flaggedReason: `Webpage URL detected — "${url.slice(0, 120)}" is a webpage link, not a direct file download. Users cannot open this in the PDF viewer. Replace with a direct .pdf download URL.`,
      };
    }

    try {
      // ── OPTION A: Test via proxy endpoint — identical path as real users ────
      // This catches expired S3 URLs, permission errors, and all access issues.
      const PORT_INTERNAL = process.env.PORT || 3000;
      const proxyUrl = `http://127.0.0.1:${PORT_INTERNAL}/api/content/${contentId}/proxy-pdf`;
      const validatorToken = makeValidatorToken();

      const proxyCtrl = new AbortController();
      const proxyTid = setTimeout(() => proxyCtrl.abort(), 15000);

      const proxyRes = await fetch(proxyUrl, {
        method: "GET",
        headers: { 
          Authorization: `Bearer ${validatorToken}`,
          Range: "bytes=0-8192" // Only fetch the first 8KB for validation, drastically speeding up the engine!
        },
        signal: proxyCtrl.signal as any,
      }).catch(() => null);
      clearTimeout(proxyTid);

      if (!proxyRes) {
        return { isViewable: false, viewerStatus: "Timeout", flaggedReason: "Proxy endpoint did not respond within 15 seconds — file may be unreachable." };
      }
      if (proxyRes.status === 404) {
        return { isViewable: false, viewerStatus: "No File", flaggedReason: "Content not found or has no file URL." };
      }
      if (proxyRes.status >= 400) {
        return { isViewable: false, viewerStatus: "Load Failed", flaggedReason: `Proxy returned HTTP ${proxyRes.status} — file inaccessible to users.` };
      }

      // Videos: proxy 2xx is sufficient
      if (isVideo) {
        return { isViewable: true, viewerStatus: "Rendered OK" };
      }

      // ── Read actual bytes — NEVER trust proxy Content-Type ──────────────────
      // The proxy ALWAYS sets Content-Type: application/pdf regardless of what
      // the upstream URL actually returns. So content-type headers are useless here.
      // We must check the actual bytes received to determine the real file type.
      
      // Instead of .arrayBuffer() which downloads the ENTIRE file if the server ignores Range,
      // we manually read only the first 8KB from the stream and immediately abort!
      let totalLength = 0;
      const chunks: Uint8Array[] = [];
      
      if (proxyRes.body) {
        const reader = proxyRes.body.getReader();
        try {
          while (totalLength < 8192) {
            const { done, value } = await reader.read();
            if (done || !value) break;
            chunks.push(value);
            totalLength += value.length;
          }
        } finally {
          // Forcefully abort the rest of the stream to save massive bandwidth/time
          proxyCtrl.abort(); 
        }
      } else {
        const rawBuf = await proxyRes.arrayBuffer();
        chunks.push(new Uint8Array(rawBuf));
        totalLength = chunks[0].length;
      }

      const fullBytes = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        fullBytes.set(chunk, offset);
        offset += chunk.length;
      }

      const rawBytes = fullBytes.slice(0, 16);
      const magic = new TextDecoder("latin1").decode(rawBytes).substring(0, 5);

      // ── Detect HTML response — catches webpage URLs not in the known-pattern list ─
      // e.g. archive.org/details/, jstor.org/stable/, any redirect page, etc.
      const first16Str = magic.toLowerCase();
      const isHtml = first16Str.startsWith("<!doc") || first16Str.startsWith("<html") ||
                     first16Str.startsWith("<!-") || first16Str.trimStart().startsWith("<");
      if (isHtml) {
        return {
          isViewable: false,
          viewerStatus: "Load Failed",
          flaggedReason: `The stored URL returns an HTML webpage, not a PDF file. URL: "${url.slice(0, 100)}". This cannot be opened in the PDF viewer. Replace it with a direct download link ending in .pdf`,
        };
      }

      if (isPdf) {
        // Strictly require %PDF magic bytes — NO content-type fallback.
        // (The proxy always reports application/pdf so that header is meaningless.)
        if (!magic.startsWith("%PDF")) {
          return {
            isViewable: false,
            viewerStatus: "Load Failed",
            flaggedReason: `File does not start with PDF magic bytes (found: "${magic.substring(0, 4)}"). The URL may point to a redirect page, login wall, or non-PDF file instead of a direct PDF download.`,
          };
        }

        // Deeper structure check: look for /Page or stream in first 8KB
        const pdfStr = new TextDecoder("latin1").decode(fullBytes.slice(0, Math.min(fullBytes.length, 8192)));
        const hasPages = pdfStr.includes("/Page") || pdfStr.includes("/Type") || pdfStr.includes("stream");

        if (!hasPages && fullBytes.length < 512) {
          return {
            isViewable: false,
            viewerStatus: "Load Failed",
            flaggedReason: "PDF file is too small or contains no readable page structure. The file is likely empty or corrupt.",
          };
        }

        return { isViewable: true, viewerStatus: "Rendered OK" };
      }

      // Non-PDF, non-video, non-HTML — proxy 2xx = accessible
      return { isViewable: true, viewerStatus: "Rendered OK" };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return { isViewable: false, viewerStatus: "Timeout", flaggedReason: "Proxy connection timed out." };
      }
      return { isViewable: false, viewerStatus: "Load Failed", flaggedReason: `Network error: ${err?.message || "Unknown"}` };
    }
  };

  // ── Main viewer validation runner ──────────────────────────────────────────
  const VIEWER_BATCH_SIZE = 50;

  const runViewerValidationEngine = async (type: "Manual" | "Automatic") => {
    if (currentViewerValidationProgress.isRunning) return;

    try {
      const contents = await prisma.content.findMany({
        where: { fileUrl: { not: null } }, // scan all content that has a file URL
        select: { id: true, title: true, contentType: true, fileUrl: true, status: true },
      });

      currentViewerValidationProgress = {
        isRunning: true,
        totalItems: contents.length,
        scannedItems: 0,
        validCount: 0,
        flaggedCount: 0,
        currentTask: "Initializing Viewer Engine...",
        startedAt: Date.now(),
      };

      // Create report entry
      const report = await prisma.validationReport.create({
        data: {
          type,
          validationType: "ViewerBased",
          status: "Reviewing",
          issues: [],
        },
      });

      const issues: any[] = [];
      let validCount = 0;
      let flaggedCount = 0;

      // Process in batches to avoid overloading the server
      for (let i = 0; i < contents.length; i += VIEWER_BATCH_SIZE) {
        if (!currentViewerValidationProgress.isRunning) {
          console.log("Viewer validation stopped by user.");
          break;
        }

        const batch = contents.slice(i, i + VIEWER_BATCH_SIZE);

        currentViewerValidationProgress.currentTask = `Validating items ${i + 1}–${Math.min(i + VIEWER_BATCH_SIZE, contents.length)} of ${contents.length}…`;

        await Promise.all(
          batch.map(async (c) => {
            try {
              const result = await validateFileViewability(c.id, c.fileUrl || "", c.contentType);

              // Persist per-content validation status
              // Only flag issues. Do NOT auto-draft or auto-publish items to let users decide.
              const updateData: any = {
                validationStatus: result.isViewable ? "VALID_VIEWABLE" : "FLAGGED_CONTENT",
                viewerStatus: result.viewerStatus,
                isViewable: result.isViewable,
                flaggedReason: result.flaggedReason ?? null,
                lastValidatedAt: new Date(),
              };
              await prisma.content.update({ where: { id: c.id }, data: updateData });

              if (!result.isViewable) {
                issues.push({
                  contentId: c.id,
                  title: c.title,
                  contentType: c.contentType,
                  issueType: "ViewerValidationFailed",
                  description: result.flaggedReason || "File could not be verified by viewer.",
                  viewerStatus: result.viewerStatus,
                });
                flaggedCount++;
              } else {
                validCount++;
              }
            } catch (itemErr: any) {
              // One bad item should NOT crash the whole scan — log and mark flagged
              console.error(`[viewer-validator] Item ${c.id} ("${c.title}") threw an error:`, itemErr?.message || itemErr);
              issues.push({
                contentId: c.id,
                title: c.title,
                contentType: c.contentType,
                issueType: "ViewerValidationFailed",
                description: `Validation threw an unexpected error: ${itemErr?.message || "Unknown error"}`,
                viewerStatus: "Load Failed",
              });
              flaggedCount++;
              // Still update the DB so this item shows as flagged
              try {
                await prisma.content.update({
                  where: { id: c.id },
                  data: {
                    validationStatus: "FLAGGED_CONTENT",
                    viewerStatus: "Load Failed",
                    isViewable: false,
                    flaggedReason: `Validation error: ${itemErr?.message || "Unknown"}`,
                    lastValidatedAt: new Date(),
                  },
                });
              } catch {}
            } finally {
              currentViewerValidationProgress.scannedItems++;
              currentViewerValidationProgress.validCount = validCount;
              currentViewerValidationProgress.flaggedCount = flaggedCount;
            }
          })
        );

        // Yield event loop between batches
        await new Promise((r) => setTimeout(r, 50));
      }

      currentViewerValidationProgress.currentTask = "Saving report…";

      await prisma.validationReport.update({
        where: { id: report.id },
        data: {
          status: "Draft",
          totalItemsScanned: contents.length,
          issuesFound: issues.length,
          validCount,
          flaggedCount,
          issues,
          completedAt: new Date(),
        },
      });

      // The user requested to NOT auto-draft flagged content automatically.
      // Instead, they will use the manual "Auto-Cleanup" authority button in the UI.
    } catch (e) {
      console.error("Viewer validation engine crashed:", e);
    } finally {
      currentViewerValidationProgress.isRunning = false;
      currentViewerValidationProgress.currentTask = "Idle";
      currentViewerValidationProgress.startedAt = undefined;
    }
  };

  // ── POST /api/admin/validator/run-viewer ────────────────────────────────────
  app.post("/api/admin/validator/run-viewer", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    if (currentViewerValidationProgress.isRunning) {
      return res.status(400).json({ error: "Viewer validation is already running." });
    }
    res.json({ message: "Viewer validation triggered. Running in background." });
    runViewerValidationEngine("Manual").catch((e) => console.error("Viewer validation error:", e));
  });

  // ── POST /api/admin/validator/stop-viewer ───────────────────────────────────
  app.post("/api/admin/validator/stop-viewer", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    if (currentViewerValidationProgress.isRunning) {
      currentViewerValidationProgress.isRunning = false;
      return res.json({ message: "Validation process stopped successfully." });
    }
    res.json({ message: "Validation is not running." });
  });

  // ── GET /api/admin/validator/viewer-progress ───────────────────────────────
  app.get("/api/admin/validator/viewer-progress", authenticateJWT, requireSuperAdmin, async (_req, res) => {
    res.json(currentViewerValidationProgress);
  });

  // ── GET /api/admin/validator/content-status ────────────────────────────────
  // Returns all content with their viewer validation status (paginated, filterable)
  app.get("/api/admin/validator/content-status", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { status, page = "1", limit = "50", search } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const where: any = {};
      if (status && status !== "All") where.validationStatus = status;
      if (search) {
        where.OR = [
          { title: { contains: search as string, mode: "insensitive" } },
          { contentType: { contains: search as string, mode: "insensitive" } },
        ];
      }

      const [items, total] = await Promise.all([
        prisma.content.findMany({
          where,
          select: {
            id: true,
            title: true,
            contentType: true,
            domain: true,
            fileUrl: true,
            validationStatus: true,
            viewerStatus: true,
            isViewable: true,
            flaggedReason: true,
            lastValidatedAt: true,
            status: true,
          },
          orderBy: { lastValidatedAt: "desc" },
          skip,
          take: parseInt(limit),
        }),
        prisma.content.count({ where }),
      ]);

      // Summary counts
      const [notValidated, validViewable, flaggedContent] = await Promise.all([
        prisma.content.count({ where: { validationStatus: "Not Validated", status: { not: "Draft" } } }),
        prisma.content.count({ where: { validationStatus: "VALID_VIEWABLE" } }),
        prisma.content.count({ where: { validationStatus: "FLAGGED_CONTENT" } }),
      ]);

      res.json({ items, total, page: parseInt(page), limit: parseInt(limit), summary: { notValidated, validViewable, flaggedContent } });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch content validation status" });
    }
  });

  // ── PATCH /api/admin/validator/content/:id/mark-valid ──────────────────────
  app.patch("/api/admin/validator/content/:id/mark-valid", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      await prisma.content.update({
        where: { id },
        data: {
          validationStatus: "VALID_VIEWABLE",
          viewerStatus: "Manually Verified",
          isViewable: true,
          flaggedReason: null,
          lastValidatedAt: new Date(),
        },
      });
      res.json({ message: "Content marked as VALID_VIEWABLE by admin." });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark content as valid" });
    }
  });

  // ── PATCH /api/admin/validator/content/:id/move-draft ─────────────────────
  app.patch("/api/admin/validator/content/:id/move-draft", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      await prisma.content.update({
        where: { id },
        data: { status: "Draft" },
      });
      res.json({ message: "Content moved to Draft." });
    } catch (error) {
      res.status(500).json({ error: "Failed to move content to draft" });
    }
  });

  // ── POST /api/admin/validator/auto-cleanup ─────────────────────────────────
  // Bulk-drafts all FLAGGED_CONTENT items that are currently Published
  app.post("/api/admin/validator/auto-cleanup", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const result = await prisma.content.updateMany({
        where: { validationStatus: "FLAGGED_CONTENT", status: { not: "Draft" } },
        data: { status: "Draft" },
      });

      // Log on the latest viewer-based report (if any)
      const latestReport = await prisma.validationReport.findFirst({
        where: { validationType: "ViewerBased" },
        orderBy: { startedAt: "desc" },
      });
      if (latestReport) {
        const tl: any[] = Array.isArray(latestReport.timeline) ? (latestReport.timeline as any[]) : [];
        const actor = (req.user as any)?.email || "Admin";
        tl.push({
          action: "auto_cleanup",
          by: actor,
          at: new Date().toISOString(),
          count: result.count,
          note: `Auto-cleanup: ${result.count} flagged item(s) moved to Draft.`,
        });
        await prisma.validationReport.update({ where: { id: latestReport.id }, data: { timeline: tl } });
      }

      res.json({ message: `Auto-cleanup complete. ${result.count} item(s) moved to Draft.`, count: result.count });
    } catch (error) {
      res.status(500).json({ error: "Auto-cleanup failed" });
    }
  });

  // ── POST /api/admin/validator/re-validate ──────────────────────────────────
  // Re-validate a specific list of content IDs
  app.post("/api/admin/validator/re-validate", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
    try {
      const { contentIds, status, search } = req.body;
      let contents;

      if (Array.isArray(contentIds) && contentIds.length > 0) {
        contents = await prisma.content.findMany({
          where: { id: { in: contentIds } },
          select: { id: true, title: true, contentType: true, fileUrl: true },
        });
      } else if (status) {
        const where: any = {};
        if (status !== "All") where.validationStatus = status;
        if (search) {
          where.OR = [
            { title: { contains: search, mode: "insensitive" } },
            { contentType: { contains: search, mode: "insensitive" } },
          ];
        }
        contents = await prisma.content.findMany({
          where,
          select: { id: true, title: true, contentType: true, fileUrl: true },
        });
      } else {
        return res.status(400).json({ error: "contentIds array or status filter is required." });
      }

      if (contents.length > 50) {
        if (currentViewerValidationProgress.isRunning) {
          return res.status(400).json({ error: "A viewer validation scan is already running." });
        }
        
        res.json({ message: `Bulk re-validation of ${contents.length} items started.`, background: true });
        
        // Run in background
        (async () => {
          currentViewerValidationProgress = {
            isRunning: true,
            totalItems: contents.length,
            scannedItems: 0,
            validCount: 0,
            flaggedCount: 0,
            currentTask: "Initializing Bulk Engine...",
            startedAt: Date.now(),
          };
          
          try {
            const VIEWER_BATCH_SIZE = 10;
            for (let i = 0; i < contents.length; i += VIEWER_BATCH_SIZE) {
              if (!currentViewerValidationProgress.isRunning) {
                console.log("Bulk re-validation stopped by user.");
                break;
              }
              const batch = contents.slice(i, i + VIEWER_BATCH_SIZE);
              currentViewerValidationProgress.currentTask = `Re-validating ${i + 1}–${Math.min(i + VIEWER_BATCH_SIZE, contents.length)} of ${contents.length}…`;

              await Promise.all(
                batch.map(async (c) => {
                  try {
                    const result = await validateFileViewability(c.id, c.fileUrl || "", c.contentType);
                    await prisma.content.update({
                      where: { id: c.id },
                      data: {
                        validationStatus: result.isViewable ? "VALID_VIEWABLE" : "FLAGGED_CONTENT",
                        viewerStatus: result.viewerStatus,
                        isViewable: result.isViewable,
                        flaggedReason: result.flaggedReason ?? null,
                        lastValidatedAt: new Date(),
                      },
                    });
                    
                    if (result.isViewable) {
                      currentViewerValidationProgress.validCount++;
                    } else {
                      currentViewerValidationProgress.flaggedCount++;
                    }
                  } catch (err) {
                    console.error("Item re-validation error:", err);
                  }
                })
              );

              currentViewerValidationProgress.scannedItems += batch.length;
            }
          } catch (e) {
            console.error("Bulk re-validation crashed:", e);
          } finally {
            currentViewerValidationProgress.isRunning = false;
            currentViewerValidationProgress.currentTask = "Idle";
            currentViewerValidationProgress.startedAt = undefined;
          }
        })();
        return;
      }

      // Synchronous processing for small batches (<= 50)
      const results: any[] = [];
      for (const c of contents) {
        const result = await validateFileViewability(c.id, c.fileUrl || "", c.contentType);
        await prisma.content.update({
          where: { id: c.id },
          data: {
            validationStatus: result.isViewable ? "VALID_VIEWABLE" : "FLAGGED_CONTENT",
            viewerStatus: result.viewerStatus,
            isViewable: result.isViewable,
            flaggedReason: result.flaggedReason ?? null,
            lastValidatedAt: new Date(),
          },
        });
        results.push({ id: c.id, title: c.title, ...result });
      }

      res.json({ message: `Re-validated ${results.length} item(s).`, results });
    } catch (error) {
      console.error("Re-validation error:", error);
      res.status(500).json({ error: "Re-validation failed" });
    }
  });

  // ── Agency Partnership API ───────────────────────────────────────────────
  app.post("/api/agency-inquiry", async (req, res) => {
    try {
      const { agencyName, contactPerson, email, phone, region, experience, message } = req.body;
      const inquiry = await prisma.agencyInquiry.create({
        data: { agencyName, contactPerson, email, phone, region, experience, message }
      });

      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      const adminMailOptions = {
        from: `"STM Digital Library" <${emailFrom}>`,
        to: process.env.ADMIN_EMAIL || COMPANY_DETAILS.email,
        subject: `🤝 New Agency Partner Application: ${agencyName}`,
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;">`+
          `<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">🤝 New Agency Partnership Application</p>`+
          `<p style="margin:0 0 20px;font-size:13px;color:#475569;">A new reseller agency has applied to partner with STM Digital Library.</p>`+
          `<table width="100%" cellpadding="0" cellspacing="0" style="background:#1e3a6e;border-radius:10px;margin-bottom:20px;"><tr><td style="padding:18px 20px;">`+
          `<p style="color:#bfdbfe;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">🏢 Agency Profile</p>`+
          `<p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Agency:</span> <strong style="color:#fff;">${agencyName}</strong></p>`+
          `<p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Contact:</span> <strong style="color:#e2e8f0;">${contactPerson}</strong></p>`+
          `<p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Region:</span> <strong style="color:#86efac;">${region||'Not specified'}</strong></p>`+
          `<p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Experience:</span> <strong style="color:#fde68a;">${experience||'Not specified'}</strong></p>`+
          `</td></tr></table>`+
          `<table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:16px;">`+
          `<tr style="background:#f8fafc;"><td style="padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;" colspan="2">Contact Details</td></tr>`+
          `<tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;width:35%;border-bottom:1px solid #f1f5f9;">Email</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e3a6e;border-bottom:1px solid #f1f5f9;">${email}</td></tr>`+
          `<tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Phone</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${phone||'Not provided'}</td></tr>`+
          `<tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;">Message</td><td style="padding:9px 16px;font-size:13px;color:#475569;">${message||'None'}</td></tr>`+
          `</table>`+
          `<div style="background:#eff6ff;border-left:4px solid #1e3a6e;border-radius:0 8px 8px 0;padding:12px 16px;">`+
          `<p style="margin:0;font-size:13px;color:#1e3a6e;">ℹ️ Use <strong>Accept / Reject</strong> in the admin panel to respond.</p></div>`+
          `</td></tr>`
        )
      };

      const userMailOptions = {
        from: `"STM Digital Library" <${emailFrom}>`,
        to: email,
        subject: `🌟 Your Partnership Application — STM Digital Library`,
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;">`+
          `<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">🌟 Application Received!</p>`+
          `<p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.7;">Dear <strong>${contactPerson}</strong>, thank you for applying to become a certified partner of <strong>STM Digital Library</strong>. Your application for <strong>${agencyName}</strong> is under review.</p>`+
          `<table width="100%" cellpadding="0" cellspacing="0" style="background:#1e3a6e;border-radius:10px;margin-bottom:20px;"><tr><td style="padding:18px 20px;">`+
          `<p style="color:#bfdbfe;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">💼 Application Summary</p>`+
          `<p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Agency:</span> <strong style="color:#fff;">${agencyName}</strong></p>`+
          `<p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Region:</span> <strong style="color:#86efac;">${region||'Not specified'}</strong></p>`+
          `<p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Status:</span> <strong style="color:#fde68a;">⏳ Under Review</strong></p>`+
          `</td></tr></table>`+
          `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;border-radius:10px;border:1px solid #ddd6fe;margin-bottom:18px;"><tr><td style="padding:18px 20px;">`+
          `<p style="color:#7e22ce;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">🏆 What Partners Get</p>`+
          `<p style="margin:4px 0;font-size:13px;color:#1e293b;">✦ Exclusive reseller pricing &amp; margins</p>`+
          `<p style="margin:4px 0;font-size:13px;color:#1e293b;">✦ Dedicated partner support &amp; training</p>`+
          `<p style="margin:4px 0;font-size:13px;color:#1e293b;">✦ Co-branded marketing materials</p>`+
          `<p style="margin:4px 0;font-size:13px;color:#1e293b;">✦ Access to 50,000+ academic journals &amp; content</p>`+
          `</td></tr></table>`+
          `<p style="font-size:12px;color:#64748b;margin:0;">We'll respond within <strong>2–3 business days</strong> at <strong>${email}</strong>. For urgent queries: <a href="mailto:${COMPANY_DETAILS.email}" style="color:#1e3a6e;font-weight:600;">${COMPANY_DETAILS.email}</a></p>`+
          `</td></tr>`
        )
      };

      await sendMail(adminMailOptions);
      await sendMail(userMailOptions);

      res.json({ success: true, inquiry });
    } catch (error) {
      console.error("Failed to create agency inquiry:", error);
      res.status(500).json({ error: "Failed to submit inquiry" });
    }
  });

  app.get("/api/agency-inquiry", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const inquiries = await prisma.agencyInquiry.findMany({
        orderBy: { createdAt: "desc" }
      });
      res.json(inquiries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch inquiries" });
    }
  });

  app.post("/api/agency-inquiry/accept", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id, discount, emailContent, validUntil, subject, html, attachment } = req.body;
      
      const inquiry = await prisma.agencyInquiry.findUnique({ where: { id } });
      if (!inquiry) return res.status(404).json({ error: "Inquiry not found" });

      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      
      const mailOptions: any = {
        from: emailFrom,
        to: inquiry.email,
        subject: subject || "Welcome to the STM Digital Library Agency Partnership Program",
        html: html || `<div style="font-family: Arial, sans-serif; white-space: pre-wrap;">${emailContent}</div>`
      };

      if (attachment && attachment.content) {
        mailOptions.attachments = [
          {
            filename: attachment.filename || "Partnership_Agreement.pdf",
            content: Buffer.from(attachment.content, 'base64'),
            contentType: "application/pdf"
          }
        ];
      }

      await sendMail(mailOptions);

      const updated = await prisma.agencyInquiry.update({
        where: { id },
        data: { 
          status: "Accepted", 
          discount, 
          validUntil: validUntil ? new Date(validUntil) : null 
        }
      });

      res.json({ success: true, inquiry: updated });
    } catch (error) {
      console.error("Failed to accept agency inquiry:", error);
      res.status(500).json({ error: "Failed to process acceptance" });
    }
  });

  app.post("/api/agency-inquiry/reject", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id, subject, html } = req.body;
      
      const inquiry = await prisma.agencyInquiry.findUnique({ where: { id } });
      if (!inquiry) return res.status(404).json({ error: "Inquiry not found" });

      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      
      await sendMail({
        from: emailFrom,
        to: inquiry.email,
        subject: subject || "Update on Your STM Digital Library Partnership Application",
        html: html || "<p>Thank you for your interest, but we cannot proceed with your application at this time.</p>"
      });

      const updated = await prisma.agencyInquiry.update({
        where: { id },
        data: { status: "Rejected" }
      });
      res.json({ success: true, inquiry: updated });
    } catch (error) {
      console.error("Failed to reject agency inquiry:", error);
      res.status(500).json({ error: "Failed to process rejection" });
    }
  });

  // ========================
  // Coupon Module
  // ========================
  app.get("/api/coupons", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
      res.json(coupons);
    } catch (e) {
      console.error(e); res.status(500).json({ error: "Failed to fetch coupons" });
    }
  });

  app.post("/api/coupons", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { code, discountType, discountValue, maxUses, validFrom, validUntil, minimumOrderAmount } = req.body;
      const existing = await prisma.coupon.findUnique({ where: { code } });
      if (existing) return res.status(400).json({ error: "Coupon code already exists" });
      const coupon = await prisma.coupon.create({
        data: { 
          code, 
          discountType, 
          discountValue: Number(discountValue), 
          maxUses: maxUses ? Number(maxUses) : null, 
          validFrom: validFrom ? new Date(validFrom) : null, 
          validUntil: validUntil ? new Date(validUntil) : null, 
          minimumOrderAmount: minimumOrderAmount ? Number(minimumOrderAmount) : null 
        }
      });
      res.json(coupon);
    } catch (e) {
      console.error(e); res.status(500).json({ error: "Failed to create coupon" });
    }
  });

  app.put("/api/coupons/:id", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { isActive } = req.body;
      const coupon = await prisma.coupon.update({
        where: { id: req.params.id },
        data: { isActive }
      });
      res.json(coupon);
    } catch (e) {
      console.error(e); res.status(500).json({ error: "Failed to update coupon" });
    }
  });

  app.delete("/api/coupons/:id", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      await prisma.coupon.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (e) {
      console.error(e); res.status(500).json({ error: "Failed to delete coupon" });
    }
  });

  app.post("/api/coupons/validate", authenticateJWT, requireSalesRole, async (req: any, res) => {
    try {
      const { code, orderAmount } = req.body;
      const coupon = await prisma.coupon.findUnique({ where: { code } });
      if (!coupon) return res.status(404).json({ error: "Invalid coupon code" });
      if (!coupon.isActive) return res.status(400).json({ error: "Coupon is not active" });
      if (coupon.validFrom && new Date(coupon.validFrom) > new Date()) return res.status(400).json({ error: "Coupon not yet valid" });
      if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) return res.status(400).json({ error: "Coupon has expired" });
      if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ error: "Coupon usage limit reached" });
      if (coupon.minimumOrderAmount !== null && orderAmount < coupon.minimumOrderAmount) return res.status(400).json({ error: `Minimum order amount of ₹${coupon.minimumOrderAmount} required` });
      
      let discount = 0;
      if (coupon.discountType === "percentage") {
        discount = (orderAmount * coupon.discountValue) / 100;
      } else {
        discount = coupon.discountValue;
      }
      
      res.json({ valid: true, discount, couponId: coupon.id });
    } catch (e) {
      console.error(e); res.status(500).json({ error: "Failed to validate coupon" });
    }
  });

  app.get("/api/coupons/:id", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const coupon = await prisma.coupon.findUnique({
        where: { id: req.params.id },
        include: {
          usages: {
            include: { user: { select: { displayName: true, email: true } } },
            orderBy: { usedAt: "desc" }
          }
        }
      });
      if (!coupon) return res.status(404).json({ error: "Coupon not found" });
      res.json(coupon);
    } catch (e) {
      console.error(e); res.status(500).json({ error: "Failed to fetch coupon details" });
    }
  });

  app.post("/api/analytics/track", async (req, res) => {
    try {
      const { path, userRole, userId, sessionId } = req.body;
      const xForwardedFor = req.headers['x-forwarded-for'];
      const cfIp = req.headers['cf-connecting-ip'];
      let ipAddress = cfIp || (xForwardedFor ? (xForwardedFor as string).split(',')[0].trim() : req.socket.remoteAddress);
      
      const cfCountry = req.headers['cf-ipcountry'];
      const cfCity = req.headers['cf-ipcity'];
      let locationStr = null;
      if (cfCountry) locationStr = cfCity ? `${cfCity}, ${cfCountry}` : cfCountry;

      // Append location to userAgent field temporarily or we can just append to IP string
      const finalIpStr = locationStr ? `${ipAddress} (${locationStr})` : String(ipAddress);

      const userAgent = req.headers['user-agent'];

      await prisma.pageVisit.create({
        data: {
          path,
          userId,
          userRole,
          sessionId,
          ipAddress: finalIpStr,
          userAgent: userAgent ? String(userAgent) : null
        }
      });
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to track visit" });
    }
  });

  app.get("/api/analytics/traffic", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const { startDate, endDate } = req.query;
      
      let dateFilter = {};
      if (startDate && endDate) {
        dateFilter = {
          createdAt: {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string)
          }
        };
      } else {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        dateFilter = { createdAt: { gte: thirtyDaysAgo } };
      }

      const totalVisits = await prisma.pageVisit.count({ where: dateFilter });
      
      const topPagesRaw = await prisma.pageVisit.groupBy({
        by: ['path'],
        where: dateFilter,
        _count: { path: true },
        orderBy: { _count: { path: 'desc' } },
        take: 10
      });
      
      const topPages = topPagesRaw.map(p => ({
        path: p.path,
        count: p._count.path
      }));

      const allVisits = await prisma.pageVisit.findMany({
        where: dateFilter,
        select: { createdAt: true, sessionId: true }
      });
      
      const dailyDataMap = new Map();
      const dailySessionSets = new Map();
      
      allVisits.forEach(v => {
        const dateStr = v.createdAt.toISOString().split('T')[0];
        if (!dailySessionSets.has(dateStr)) dailySessionSets.set(dateStr, new Set());
        if (v.sessionId) dailySessionSets.get(dateStr).add(v.sessionId);
        
        dailyDataMap.set(dateStr, (dailyDataMap.get(dateStr) || 0) + 1);
      });
      
      const dailyData = Array.from(dailyDataMap.entries())
        .map(([date, pageViews]) => ({ 
          date, 
          pageViews, 
          uniqueSessions: dailySessionSets.get(date)?.size || 0 
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
      const totalUniqueSessions = new Set(allVisits.map(v => v.sessionId).filter(Boolean)).size;

      res.json({ totalVisits, topPages, dailyData, totalUniqueSessions });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/detailed", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const { date } = req.query;
      
      let dateFilter: any = { sessionId: { not: null } };
      
      if (date) {
        const startOfDay = new Date(date as string);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(date as string);
        endOfDay.setHours(23, 59, 59, 999);
        
        dateFilter.createdAt = {
          gte: startOfDay,
          lte: endOfDay
        };
      }

      const visits = await prisma.pageVisit.findMany({
        orderBy: { createdAt: 'asc' },
        where: dateFilter
      });

      const sessionsMap = new Map<string, any>();
      const userIds = new Set<string>();

      for (const visit of visits) {
        if (!visit.sessionId) continue;
        const sId = visit.sessionId;
        
        if (visit.userId) userIds.add(visit.userId);
        if (!sessionsMap.has(sId)) {
          sessionsMap.set(sId, {
            sessionId: sId,
            userId: visit.userId,
            userRole: visit.userRole || 'Guest',
            ipAddress: visit.ipAddress,
            userAgent: visit.userAgent,
            startTime: visit.createdAt,
            endTime: visit.createdAt,
            paths: []
          });
        }
        const s = sessionsMap.get(sId);
        s.endTime = visit.createdAt;
        s.paths.push({ path: visit.path, time: visit.createdAt });
      }

      // Fetch user details for identified users
      const users = await prisma.user.findMany({
        where: { id: { in: Array.from(userIds) } },
        select: { id: true, displayName: true, email: true }
      });
      const userMap = new Map(users.map((u: any) => [u.id, u]));

      const sessions = Array.from(sessionsMap.values()).map(s => {
        const timeSpentSeconds = Math.max(0, Math.floor((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 1000));
        let userName = s.userRole;
        if (s.userId && userMap.has(s.userId)) {
          const u = userMap.get(s.userId);
          userName = `${u.displayName || 'User'} (${u.email})`;
        }
        return {
          ...s,
          userName,
          timeSpentSeconds,
          timeSpentFormatted: timeSpentSeconds > 60 ? `${Math.floor(timeSpentSeconds / 60)}m ${timeSpentSeconds % 60}s` : `${timeSpentSeconds}s`
        };
      }).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

      res.json(sessions);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to fetch detailed analytics" });
    }
  });

  app.get("/api/admin/verifications", authenticateJWT, requireAdminOrManager, async (req: any, res: any) => {
    try {
      const verifications = await (prisma as any).emailVerification.findMany({
        orderBy: { updatedAt: 'desc' }
      });
      res.json(verifications);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch verifications" });
    }
  });

  // --- Feedback API ---
  app.post("/api/feedback", authenticateJWT, async (req: any, res) => {
    try {
      const { rating, comment, type } = req.body;
      const feedback = await prisma.feedback.create({
        data: {
          rating: Number(rating) || 5,
          comment,
          type: type || "General",
          userId: req.user.uid
        }
      });
      res.json({ success: true, feedback });
    } catch (error) {
      console.error("Submit feedback error:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  app.get("/api/admin/feedbacks", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const feedbacks = await prisma.feedback.findMany({
        include: {
          user: {
            select: { 
              displayName: true, 
              email: true, 
              role: true, 
              organization: true,
              isDemoAccount: true,
              subscriptions: {
                where: { status: 'Active' },
                select: { planName: true, domains: true }
              }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      });
      res.json(feedbacks);
    } catch (error) {
      console.error("Fetch feedbacks error:", error);
      res.status(500).json({ error: "Failed to fetch feedbacks" });
    }
  });

  app.get("/api/admin/feedbacks/:id", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const feedback = await prisma.feedback.findUnique({
        where: { id: req.params.id },
        include: {
          user: {
            select: { 
              id: true,
              displayName: true, 
              email: true, 
              role: true, 
              organization: true,
              isDemoAccount: true,
              createdAt: true,
              updatedAt: true,
              subscriptions: {
                select: { id: true, planName: true, domains: true, status: true, startDate: true, endDate: true },
                orderBy: { startDate: 'desc' }
              },
              institution: {
                select: {
                  subscriptions: {
                    select: { id: true, planName: true, domains: true, status: true, startDate: true, endDate: true },
                    orderBy: { startDate: 'desc' }
                  }
                }
              }
            }
          }
        }
      });
      if (!feedback) return res.status(404).json({ error: "Feedback not found" });
      res.json(feedback);
    } catch (error) {
      console.error("Fetch feedback detail error:", error);
      res.status(500).json({ error: "Failed to fetch feedback details" });
    }
  });

  app.get("/api/user/feedbacks", authenticateJWT, async (req: any, res) => {
    try {
      const feedbacks = await prisma.feedback.findMany({
        where: { userId: req.user.uid },
        orderBy: { createdAt: "desc" }
      });
      res.json(feedbacks);
    } catch (error) {
      console.error("Fetch user feedbacks error:", error);
      res.status(500).json({ error: "Failed to fetch user feedbacks" });
    }
  });

  // =========================================================================
  // CRM & LEAD MANAGEMENT ROUTES
  // =========================================================================

  // 1. ADMIN/MANAGER ROUTES
  app.get("/api/admin/leads", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const leads = await prisma.lead.findMany({
        orderBy: { createdAt: "desc" },
        include: { assignedTo: { select: { id: true, displayName: true, email: true } } }
      });
      res.json(leads);
    } catch (error) {
      console.error("Fetch leads error:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  app.post("/api/admin/leads/assign", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const { leadIds, assignedToId } = req.body;
      if (!leadIds || !Array.isArray(leadIds) || !assignedToId) {
        return res.status(400).json({ error: "Invalid data provided" });
      }

      await prisma.lead.updateMany({
        where: { id: { in: leadIds } },
        data: { assignedToId, assignedAt: new Date(), assignmentSeen: false }
      });

      // Add a system interaction note
      await prisma.leadInteraction.createMany({
        data: leadIds.map(leadId => ({
          leadId,
          userId: req.user.uid,
          type: "System",
          notes: `Assigned to executive`
        }))
      });

      res.json({ message: "Leads assigned successfully" });
    } catch (error) {
      console.error("Assign leads error:", error);
      res.status(500).json({ error: "Failed to assign leads" });
    }
  });

  app.post("/api/admin/leads/migrate", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      // 1. Migrate Demo Requests
      const demos = await prisma.demoRequest.findMany();
      let demoCount = 0;
      for (const d of demos) {
        const exists = await prisma.lead.findFirst({ where: { email: d.institutionalEmail, source: 'Demo Request' } });
        if (!exists) {
          await prisma.lead.create({
            data: {
              name: d.fullName,
              email: d.institutionalEmail,
              phone: d.whatsappNumber,
              organization: d.institutionName,
              state: d.state || null,
              source: 'Demo Request',
              status: d.status === 'Completed' ? 'Subscriber' : 'All',
              notes: d.adminNotes || "Requested Demo",
              createdAt: d.createdAt,
              updatedAt: d.updatedAt
            }
          });
          demoCount++;
        } else if (!exists.state && d.state) {
          await prisma.lead.update({ where: { id: exists.id }, data: { state: d.state } });
        }
      }

      // 2. Migrate Contact Inquiries
      const contacts = await prisma.contactInquiry.findMany();
      let contactCount = 0;
      for (const c of contacts) {
        const exists = await prisma.lead.findFirst({ where: { email: c.email, source: 'Contact Inquiry' } });
        if (!exists) {
          await prisma.lead.create({
            data: {
              name: c.fullName,
              email: c.email,
              phone: c.mobile || c.whatsapp,
              organization: c.organization,
              state: c.state || null,
              source: 'Contact Inquiry',
              status: c.status === 'Resolved' ? 'Subscriber' : 'All',
              notes: c.message || "Contact Form Inquiry",
              createdAt: c.createdAt || new Date(),
              updatedAt: c.updatedAt || new Date()
            }
          });
          contactCount++;
        } else if (!exists.state && c.state) {
          await prisma.lead.update({ where: { id: exists.id }, data: { state: c.state } });
        }
      }

      // 3. Fix Old Statuses in bulk
      await prisma.lead.updateMany({ where: { status: 'New' }, data: { status: 'All' } });
      await prisma.lead.updateMany({ where: { status: 'Contacted' }, data: { status: 'Positive' } });
      await prisma.lead.updateMany({ where: { status: 'Converted' }, data: { status: 'Subscriber' } });
      await prisma.lead.updateMany({ where: { status: 'Lost' }, data: { status: 'Negative' } });

      res.json({ message: `Migration successful. Synced ${demoCount} Demos and ${contactCount} Contacts.` });
    } catch (error) {
      console.error("Migration error:", error);
      res.status(500).json({ error: "Failed to migrate leads" });
    }
  });

  app.get("/api/admin/sales-team", authenticateJWT, requireAdminOrManager, async (req: any, res) => {
    try {
      const team = await prisma.user.findMany({
        where: { role: { in: ["SalesExecutive", "SalesManager"] } },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          createdAt: true,
          _count: {
            select: { assignedLeads: true, leadInteractions: true }
          }
        }
      });

      // Enhance each team member with subscriber count + last active
      const enhanced = await Promise.all(team.map(async (member: any) => {
        const subscriberCount = await prisma.lead.count({
          where: { assignedToId: member.id, status: "Subscriber" }
        });
        const lastInteraction = await prisma.leadInteraction.findFirst({
          where: { userId: member.id },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true }
        });
        return {
          ...member,
          subscriberCount,
          lastActiveAt: lastInteraction?.createdAt || null,
          conversionRate: member._count.assignedLeads > 0
            ? parseFloat(((subscriberCount / member._count.assignedLeads) * 100).toFixed(1))
            : 0
        };
      }));

      res.json(enhanced);
    } catch (error) {
      console.error("Fetch sales team error:", error);
      res.status(500).json({ error: "Failed to fetch sales team" });
    }
  });


  // 2. SALES EXECUTIVE ROUTES

  app.get("/api/sales/my-leads", authenticateJWT, requireSalesRole, async (req: any, res) => {
    try {
      const leads = await prisma.lead.findMany({
        where: { assignedToId: req.user.uid },
        orderBy: { updatedAt: "desc" }
      });
      // Opening My Leads = the executive has now seen their new assignments → clear the badge
      prisma.lead.updateMany({ where: { assignedToId: req.user.uid, assignmentSeen: false }, data: { assignmentSeen: true } }).catch(() => {});
      res.json(leads);
    } catch (error) {
      console.error("Fetch my leads error:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  // Sales executive notifications — newly assigned, not-yet-seen leads
  app.get("/api/sales/notifications", authenticateJWT, requireSalesRole, async (req: any, res) => {
    try {
      const where = { assignedToId: req.user.uid, assignmentSeen: false };
      const [newLeads, list] = await Promise.all([
        prisma.lead.count({ where }),
        prisma.lead.findMany({ where, orderBy: { assignedAt: "desc" }, take: 10, select: { id: true, name: true, organization: true, source: true, assignedAt: true } }),
      ]);
      res.json({ total: newLeads, newLeads, list });
    } catch (error) {
      res.status(500).json({ error: "Failed to load notifications" });
    }
  });

  app.get("/api/sales/my-activity", authenticateJWT, requireSalesRole, async (req: any, res) => {
    try {
      const myLeads = await prisma.lead.findMany({
        where: { assignedToId: req.user.uid },
        select: { id: true }
      });
      
      const interactions = await prisma.leadInteraction.findMany({
        where: { leadId: { in: myLeads.map((l: any) => l.id) } },
        orderBy: { createdAt: "desc" },
        include: {
          lead: { select: { name: true, organization: true, source: true } },
          user: { select: { displayName: true, email: true } }
        },
        take: 100
      });
      res.json(interactions);
    } catch (error) {
      console.error("Fetch my activity error:", error);
      res.status(500).json({ error: "Failed to fetch activity logs" });
    }
  });


  app.get("/api/sales/leads/:id", authenticateJWT, requireSalesRole, async (req: any, res) => {
    try {
      const lead = await prisma.lead.findUnique({
        where: { id: req.params.id },
        include: {
          interactions: {
            orderBy: { createdAt: "desc" },
            include: { user: { select: { displayName: true, email: true, role: true } } }
          }
        }
      });
      if (!lead) return res.status(404).json({ error: "Lead not found" });
      res.json(lead);
    } catch (error) {
      console.error("Fetch lead detail error:", error);
      res.status(500).json({ error: "Failed to fetch lead details" });
    }
  });

  app.put("/api/sales/leads/:id/status", authenticateJWT, requireSalesRole, async (req: any, res) => {
    try {
      const { status } = req.body;
      const lead = await prisma.lead.update({
        where: { id: req.params.id },
        data: { status }
      });
      res.json(lead);
    } catch (error) {
      console.error("Update lead status error:", error);
      res.status(500).json({ error: "Failed to update lead status" });
    }
  });

  app.post("/api/sales/leads/:id/interactions", authenticateJWT, requireSalesRole, async (req: any, res) => {
    try {
      const { type, notes } = req.body;
      const interaction = await prisma.leadInteraction.create({
        data: {
          leadId: req.params.id,
          userId: req.user.uid,
          type: type || "Note",
          notes
        },
        include: {
          user: { select: { displayName: true, email: true, role: true } }
        }
      });
      
      // Update the lead's updatedAt
      await prisma.lead.update({
        where: { id: req.params.id },
        data: { updatedAt: new Date() }
      });

      res.json(interaction);
    } catch (error) {
      console.error("Create interaction error:", error);
      res.status(500).json({ error: "Failed to create interaction" });
    }
  });

  app.get("/api/public/content/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const content = await prisma.content.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          description: true,
          authors: true,
          domain: true,
          contentType: true,
          thumbnailUrl: true,
          publishedAt: true,
        }
      });
      if (!content) return res.status(404).json({ error: "Content not found" });
      res.json({
        ...content,
        author: content.authors,
        coverImage: content.thumbnailUrl,
        publishedYear: new Date(content.publishedAt).getFullYear()
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to fetch content" });
    }
  });

  // Sitemap Cache
  let cachedSitemapIndex: string | null = null;
  let cachedStaticSitemap: string | null = null;
  const cachedContentSitemaps = new Map<string, string>();
  let sitemapCacheTime: number = 0;

  // 1. SITEMAP INDEX
  app.get("/sitemap.xml", async (req: any, res) => {
    try {
      if (cachedSitemapIndex && (Date.now() - sitemapCacheTime < 1000 * 60 * 60 * 12)) {
        res.type('application/xml');
        return res.send(cachedSitemapIndex);
      }

      const totalContent = await prisma.content.count({ where: { status: "Published" } });
      const limitPerPage = 40000;
      const totalPages = Math.ceil(totalContent / limitPerPage);
      
      const baseUrl = "https://journalslibrary.com";
      
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      
      // Static sitemap
      xml += `  <sitemap>\n    <loc>${baseUrl}/sitemap-static.xml</loc>\n    <lastmod>${new Date().toISOString()}</lastmod>\n  </sitemap>\n`;
      
      // Dynamic content sitemaps
      for (let i = 1; i <= totalPages; i++) {
        xml += `  <sitemap>\n    <loc>${baseUrl}/sitemap-content-${i}.xml</loc>\n    <lastmod>${new Date().toISOString()}</lastmod>\n  </sitemap>\n`;
      }
      
      xml += `</sitemapindex>`;
      
      cachedSitemapIndex = xml;
      sitemapCacheTime = Date.now();
      cachedContentSitemaps.clear(); // Clear content cache when index regenerates
      
      res.type('application/xml');
      res.send(xml);
    } catch (e) {
      console.error("Sitemap index error:", e);
      res.status(500).send("Error generating sitemap index");
    }
  });

  // 2. STATIC SITEMAP
  app.get("/sitemap-static.xml", (req: any, res) => {
    if (cachedStaticSitemap) {
      res.type('application/xml');
      return res.send(cachedStaticSitemap);
    }

    const baseUrl = "https://journalslibrary.com";
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    // "/subscriptions" was removed from the site when public pricing came down.
    // Leaving it here advertised a URL that renders a not-found screen, which is
    // the soft-404 the external audit flagged (COM-02 / SEO-01).
    const staticRoutes = ["/", "/journals", "/contact", "/about", "/signup"];
    for (const route of staticRoutes) {
      const loc = route === "/" ? baseUrl : `${baseUrl}${route}`;
      xml += `  <url>\n    <loc>${loc}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
    }
    
    xml += `</urlset>`;
    cachedStaticSitemap = xml;
    res.type('application/xml');
    res.send(xml);
  });

  // 3. PAGINATED CONTENT SITEMAPS
  app.get("/sitemap-content-:page.xml", async (req: any, res) => {
    try {
      const page = parseInt(req.params.page) || 1;
      const cacheKey = `page-${page}`;

      if (cachedContentSitemaps.has(cacheKey)) {
        res.type('application/xml');
        return res.send(cachedContentSitemaps.get(cacheKey));
      }

      const limitPerPage = 40000;
      const skip = (page - 1) * limitPerPage;

      const allContent = await prisma.content.findMany({
        where: { status: "Published" },
        select: { id: true, updatedAt: true },
        skip,
        take: limitPerPage,
      });

      if (allContent.length === 0) {
        return res.status(404).send("Sitemap page not found");
      }
      
      const baseUrl = "https://journalslibrary.com";
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      
      for (const content of allContent) {
        xml += `  <url>\n    <loc>${baseUrl}/preview/${content.id}</loc>\n    <lastmod>${new Date(content.updatedAt).toISOString()}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
      }
      
      xml += `</urlset>`;
      cachedContentSitemaps.set(cacheKey, xml);
      
      res.type('application/xml');
      res.send(xml);
    } catch (e) {
      console.error("Content sitemap error:", e);
      res.status(500).send("Error generating content sitemap");
    }
  });

  // Mount extraction routes BEFORE Vite/Static middleware
  setupExtractionRoutes(app, authenticateJWT, requireSuperAdmin);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(currentDir, 'dist')));
    app.get('*', (req, res) => res.sendFile(path.join(currentDir, 'dist/index.html')));
  }

  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} (Mode: ${process.env.NODE_ENV || 'development'})`);
  });
}

startServer();
