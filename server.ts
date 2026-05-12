import express from "express";

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
import crypto from "crypto";
import helmet from "helmet";
import compression from "compression";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cron from "node-cron";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

dotenv.config();

const currentDir = process.cwd();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Production Middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP if it interferes with Vite/External resources, or configure properly
  }));
  app.use(compression());
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  const JWT_SECRET = process.env.JWT_SECRET || "your-fallback-secret-for-dev-only";
  if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
    throw new Error("CRITICAL SECURITY ERROR: JWT_SECRET must be set in production environment variables.");
  }

  // Middleware to authenticate JWT
  const authenticateJWT = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) {
          return res.sendStatus(403);
        }
        req.user = user;
        next();
      });
    } else {
      res.sendStatus(401);
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

  const sendMail = async (mailOptions: any) => {
    const opts = { ...mailOptions };
    if (_logoCidAttachment && opts.html && typeof opts.html === 'string' && opts.html.includes('cid:stm-logo-email')) {
      opts.attachments = [...(opts.attachments || []), _logoCidAttachment];
    }
    const info = await transporter.sendMail(opts);
    if (isDevMode) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log('\n📨 ===== EMAIL SENT (DEV PREVIEW) =====');
      console.log(`   To: ${opts.to}`);
      console.log(`   Subject: ${opts.subject}`);
      console.log(`   🔗 Preview URL: ${previewUrl}`);
      console.log('=======================================\n');
    }
    return info;
  };

  // ── Shared Email Layout ───────────────────────────────────────────────────
  const buildEmail = (bodyRows: string) =>
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>` +
    `<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">` +
    `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;"><tr><td align="center">` +
    `<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">` +
    `<tr><td style="border-top:4px solid #1e3a6e;padding:28px 40px 20px;text-align:center;"><img src="cid:stm-logo-email" alt="STM Digital Library" width="80" height="80" style="border-radius:50%;display:block;margin:0 auto 14px;border:3px solid #e2e8f0;"/>` +
    `<h2 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#1e3a6e;">STM Digital Library</h2>` +
    `<p style="margin:0;font-size:12px;color:#64748b;">A Division of Consortium eLearning Network Pvt. Ltd.</p>` +
    `<div style="margin-top:16px;border-top:1px solid #f1f5f9;"></div></td></tr>` +
    bodyRows +
    `<tr><td style="background:#1e3a6e;padding:24px 40px;text-align:center;">` +
    `<p style="margin:0 0 12px;font-size:11px;color:#f59e0b;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">🏆 21 Years of Trusted Excellence in Education &amp; Academic Publishing</p>` +
    `<p style="margin:0 0 2px;font-size:13px;color:#cbd5e1;">Regards,</p>` +
    `<p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#ffffff;">STM Digital Library Team</p>` +
    `<p style="margin:0 0 16px;font-size:12px;color:#94a3b8;">A Division of Consortium eLearning Network Pvt. Ltd.</p>` +
    `<div style="border-top:1px solid rgba(255,255,255,0.15);padding-top:14px;">` +
    `<p style="margin:0;font-size:11px;color:#64748b;">© 2026 STM Digital Library. All rights reserved.&nbsp;&nbsp;|&nbsp;&nbsp;` +
    `<a href="#" style="color:#93c5fd;text-decoration:none;">Privacy Policy</a>&nbsp;&nbsp;|&nbsp;&nbsp;` +
    `<a href="#" style="color:#93c5fd;text-decoration:none;">Terms &amp; Conditions</a></p></div></td></tr>` +
    `<tr><td style="height:4px;background:linear-gradient(90deg,#1e3a6e,#2563eb,#1e3a6e);"></td></tr>` +
    `</table></td></tr></table></body></html>`;

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

  // Auth: Signup
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { email, password, name, organization } = req.body;
      
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
          role: email === "info@celnet.in" ? "SuperAdmin" : "Subscriber",
          status: "Active",
        }
      });

      const token = jwt.sign({ uid: userObj.id, email, role: userObj.role }, JWT_SECRET, { expiresIn: '24h' });
      
      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      const adminMailOptions = {
        from: `"STM Digital Library" <${emailFrom}>`,
        to: process.env.ADMIN_EMAIL || "info@celnet.in",
        subject: `🆕 New User Registration — ${name}`,
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;">` +
          `<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">🆕 New Subscriber Alert</p>` +
          `<p style="margin:0 0 20px;font-size:13px;color:#475569;">A new user has just registered on the platform.</p>` +
          `<table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:20px;">` +
          `<tr style="background:#f8fafc;"><td style="padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;" colspan="2">User Details</td></tr>` +
          `<tr><td style="padding:10px 16px;font-size:12px;color:#94a3b8;width:38%;border-bottom:1px solid #f1f5f9;">Full Name</td><td style="padding:10px 16px;font-size:13px;font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9;">${name}</td></tr>` +
          `<tr style="background:#fafbfc;"><td style="padding:10px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Email</td><td style="padding:10px 16px;font-size:13px;font-weight:700;color:#1e3a6e;border-bottom:1px solid #f1f5f9;">${email}</td></tr>` +
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
          `<p style="font-size:12px;color:#64748b;margin:0;">Questions? Email <a href="mailto:info@celnet.in" style="color:#1e3a6e;font-weight:600;">info@celnet.in</a> or call <strong>+91-120-4781200</strong></p>` +
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

      const { password: _, ...profile } = userObj;
      res.json(profile);
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
          totalRevenue: payments.filter(p => p.status === 'Success').reduce((acc, p) => acc + p.amount, 0),
          activeSubscriptions: subscriptions.filter(s => s.status === 'Active').length,
          pendingRequests,
          contentGrowthPct: 12.5,
          revenueGrowthPct: 8.2,
          userGrowthPct: 15.4
        }
      });
    } catch (error) {
      console.error("Admin stats error:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
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
        recentActivity: mappedRecent
      });
    } catch (error) {
      console.error("User dashboard error:", error);
      res.status(500).json({ error: "Failed to load dashboard" });
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
    
    // Institution role: allow access if institution has ANY active subscription
    // (the subscription itself filters via domains/contentTypes)
    if (userRole === 'Institution') {
      return activeSubscriptions.some(sub => {
        const d: string[] = Array.isArray(sub.domains) ? sub.domains : (sub.domains ? JSON.parse(sub.domains) : []);
        if (d.length === 0) return true; // wildcard
        const safeContentDomain = content.domain ? content.domain.toLowerCase() : "";
        const domainMatch = d.some(subDomain => {
          if (!subDomain) return false;
          const safeSub = subDomain.toLowerCase();
          return safeSub.includes(safeContentDomain) || safeContentDomain.includes(safeSub);
        });
        if (!domainMatch) return false;
        const ct: string[] = Array.isArray(sub.contentTypes) ? sub.contentTypes : (sub.contentTypes ? JSON.parse(sub.contentTypes) : []);
        if (ct.length === 0) return true;
        return ct.includes(content.contentType);
      });
    }
    
    return activeSubscriptions.some(sub => {
      // Parse domains array (stored as JSON array in Prisma)
      const d: string[] = Array.isArray(sub.domains)
        ? sub.domains as string[]
        : (sub.domains ? JSON.parse(sub.domains as string) : []);

      // Support legacy scalar domainName field and do FUZZY matching
      // e.g., if subscription is "Medical Sciences" and content domain is "Medical", it should unlock.
      const safeContentDomain = content.domain ? content.domain.toLowerCase() : "";
      
      const domainMatch = d.some(subDomain => {
        if (!subDomain) return false;
        const safeSub = subDomain.toLowerCase();
        return safeSub.includes(safeContentDomain) || safeContentDomain.includes(safeSub);
      }) || (sub.domainName && (
        sub.domainName.toLowerCase().includes(safeContentDomain) || 
        safeContentDomain.includes(sub.domainName.toLowerCase())
      ));

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

      // 2. Fetch all available content modules globally 
      const allModules = await prisma.contentModule.findMany({ where: { isActive: true } });

      // 3. Deduplicate modules based on domain + contentType (ignore different pricing userTypes)
      const uniqueModulesMap = new Map();
      allModules.forEach(mod => {
        const key = `${mod.domain}_${mod.contentType}`;
        // Keep the one with the highest totalCount if they vary, or just the first one
        if (!uniqueModulesMap.has(key) || mod.totalCount > uniqueModulesMap.get(key).totalCount) {
          uniqueModulesMap.set(key, mod);
        }
      });
      const uniqueModules = Array.from(uniqueModulesMap.values());

      // 4. Map status for each module to "locked" vs "unlocked"
      const accessMap = uniqueModules.map(mod => {
        // Construct a mock content object to reuse the checker
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

  // GET /api/content/list - Lists all actual content items, with locked flags for regular users
  app.get("/api/content/list", async (req: any, res) => {
    try {
      const { domain, contentType, search, page = "1", limit = "20", onlyUnlocked } = req.query;
      
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      const take = parseInt(limit as string);

      // Build prisma WHERE clause
      const where: any = { status: { not: "Draft" } };
      if (domain) where.domain = String(domain);
      if (contentType) where.contentType = String(contentType);
      if (search) {
        where.OR = [
          { title: { contains: String(search), mode: "insensitive" } },
          { authors: { contains: String(search), mode: "insensitive" } },
          { description: { contains: String(search), mode: "insensitive" } }
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

  // GET /api/content/:id/view - Protected endpoint to securely view content and auto-track activity
  app.get("/api/content/:id/view", authenticateJWT, async (req: any, res) => {
    try {
      const contentId = req.params.id;
      // Draft content is hidden from all non-admin users
      const isAdminRole = ['SuperAdmin', 'Admin', 'ContentManager'].includes(req.user.role);
      const content = isAdminRole
        ? await prisma.content.findUnique({ where: { id: contentId } })
        : await prisma.content.findFirst({ where: { id: contentId, status: { not: "Draft" } } });
      
      if (!content) {
        return res.status(404).json({ error: "Content not found" });
      }

      const activeSubs = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);
      const hasAccess = checkContentAccess(content, req.user.role, activeSubs);

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied. Please upgrade your subscription." });
      }

      // Log activity (safe findFirst+update/create — avoids duplicate-row race conditions)
      if (req.user.role === 'Student' || req.user.role === 'Subscriber') {
        try {
          const existing = await prisma.studentActivity.findFirst({
            where: { userId: req.user.uid, contentId: content.id }
          });
          if (existing) {
            await prisma.studentActivity.update({ where: { id: existing.id }, data: { accessedAt: new Date() } });
          } else {
            await prisma.studentActivity.create({ data: { userId: req.user.uid, contentId: content.id, timeSpent: 0, lastPage: 1 } });
          }
        } catch(e) { console.error('Activity log failed', e); }
      }

      // Return the secure file URL (or binary in a real PDF streaming setup)
      return res.json({ 
        url: content.fileUrl,
        title: content.title,
        contentType: content.contentType 
      });
      
    } catch (error) {
      res.status(500).json({ error: "Failed to view content" });
    }
  });

  // GET /api/content/:id/proxy-pdf — streams the PDF server-side to bypass browser CORS
  app.get("/api/content/:id/proxy-pdf", authenticateJWT, async (req: any, res) => {
    try {
      const contentId = req.params.id;
      const content = await prisma.content.findFirst({ 
        where: { id: contentId, status: { not: "Draft" } } 
      });
      if (!content || !content.fileUrl) {
        return res.status(404).json({ error: "Content not found" });
      }
      // Admins bypass subscription checks — they can preview any content for validation
      const isAdmin = req.user.role === 'SuperAdmin' || req.user.role === 'Admin';
      if (!isAdmin) {
        const activeSubs = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);
        const hasAccess = checkContentAccess(content, req.user.role, activeSubs);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied." });
        }
      }

      // Fetch the PDF from the upstream URL
      const https = await import('https');
      const http = await import('http');
      const upstreamUrl = new URL(content.fileUrl);
      const protocol = upstreamUrl.protocol === 'https:' ? https : http;

      // Realistic browser headers to bypass Akamai/Cloudflare bot protection
      const proxyHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'application/pdf, text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1'
      };

      const proxyReq = protocol.get(content.fileUrl, {
        headers: proxyHeaders,
      }, (proxyRes) => {
        // Follow redirects (up to 1 hop)
        if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode || 0) && proxyRes.headers.location) {
          const redirectUrl = proxyRes.headers.location;
          // handle relative redirect URLs
          const finalRedirectUrl = redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, content.fileUrl).toString();
          const redirectProtocol = finalRedirectUrl.startsWith('https') ? https : http;
          
          // Forward anti-bot cookies (e.g. ak_bmsc from Akamai)
          const redirHeaders = { ...proxyHeaders };
          if (proxyRes.headers['set-cookie']) {
            redirHeaders['Cookie'] = proxyRes.headers['set-cookie'].map((c: string) => c.split(';')[0]).join('; ');
          }

          const redirReq = redirectProtocol.get(finalRedirectUrl, {
            headers: redirHeaders
          }, (redirRes) => {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline');
            res.setHeader('Cache-Control', 'private, max-age=3600');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            redirRes.pipe(res);
          });
          redirReq.on('error', () => res.status(502).json({ error: 'PDF proxy redirect failed' }));
          return;
        }

        if ((proxyRes.statusCode || 500) >= 400) {
          console.error(`[proxy-pdf] Upstream failed with ${proxyRes.statusCode} for ${content.fileUrl}`);
          return res.status(proxyRes.statusCode || 502).json({ error: `Upstream returned ${proxyRes.statusCode}` });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (proxyRes.headers['content-length']) {
          res.setHeader('Content-Length', proxyRes.headers['content-length']);
        }
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        console.error('[proxy-pdf] Error fetching upstream:', err.message);
        if (!res.headersSent) res.status(502).json({ error: 'Failed to fetch PDF from upstream' });
      });
      req.on('close', () => proxyReq.destroy());

    } catch (error) {
      console.error('[proxy-pdf] unexpected error:', error);
      res.status(500).json({ error: "PDF proxy failed" });
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

  // ======================================================
  // USER MANAGEMENT — SuperAdmin + SubscriptionManager only
  // ======================================================

  

  // Helper: generate strong random password
  const generatePassword = (length = 12): string => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
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
            <p style="margin:0;font-size:12px;color:#6B7A99;font-weight:400;">A Division of Consortium eLearning Network Pvt. Ltd.</p>
          </td>
        </tr>

        <!-- GREETING -->
        <tr>
          <td style="padding:28px 40px 0;">
            <p style="margin:0 0 6px;font-size:13px;color:#2563EB;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">Greetings from STM Digital Library</p>
            <p style="margin:0 0 14px;font-size:20px;font-weight:700;color:#1A3A6B;">Dear ${name},</p>
            <p style="margin:0 0 10px;font-size:14px;color:#4A5568;line-height:1.7;">
              We are pleased to inform you that your subscription access has been <span style="color:#16A34A;font-weight:700;">successfully activated</span>.
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
                  <p style="margin:0 0 4px;font-size:13px;color:#1E40AF;">&#128231;&nbsp;<a href="mailto:info@celnet.in" style="color:#2563EB;font-weight:700;text-decoration:none;">info@celnet.in</a></p>
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
            <p style="margin:0 0 16px;font-size:12px;color:#94A3B8;">A Division of Consortium eLearning Network Pvt. Ltd.</p>
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
      // Strip passwords
      const sanitized = users.map(({ password: _, ...u }) => u);
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
      const { displayName, email, role, organization } = req.body;

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

      const updated = await prisma.user.update({
        where: { id },
        data: {
          ...(displayName ? { displayName } : {}),
          ...(email ? { email } : {}),
          ...(role ? { role } : {}),
          ...(organization !== undefined ? { organization } : {}),
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
      await prisma.user.delete({ where: { id } });
      res.json({ message: "User deleted" });
    } catch (err) {
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
      where: { status: 'Published', domain: { not: null } },
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
        where: { domain, status: 'Published' },
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
        to: process.env.ADMIN_EMAIL || "info@celnet.in",
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
          `<p style="font-size:12px;color:#64748b;margin:0;">Questions? Email <a href="mailto:info@celnet.in" style="color:#1e3a6e;font-weight:600;">info@celnet.in</a> or call <strong>+91-120-4781200</strong></p>`+
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
  app.get("/api/quotation/next-number", async (_req, res) => {
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
          userId: req.user?.id || null,
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
      const { status, notes } = req.body;
      const data: any = {};
      if (status) data.status = status;
      if (notes !== undefined) data.notes = notes;
      const updated = await (prisma as any).quotation.update({ where: { id }, data });
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

  // Admin: Content CRUD
  app.get("/api/admin/content", authenticateJWT, requireSuperAdmin, async (req: any, res) => {

    try {
      const { domain, contentType, search, page = "1", limit = "10" } = req.query;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      
      const where: any = {};
      if (domain) where.domain = domain;
      if (contentType) where.contentType = contentType;
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

      const results = { success: 0, failed: 0, errors: [] as any[] };
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
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
              publishingMode: item.publishingMode || "Direct"
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
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, items, userId } = req.body;
      const sign = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
        .update(sign.toString())
        .digest("hex");

      if (razorpay_signature === expectedSign) {
        // Payment verified, save to PostgreSQL
        if (items && amount) {
          await prisma.payment.create({
            data: {
              orderId: razorpay_order_id,
              paymentId: razorpay_payment_id,
              amount: parseFloat(amount),
              status: "Success",
              userId: userId || null,
              items: items || []
            }
          });

          if (Array.isArray(items)) {
            for (const item of items) {
              const days = item.duration === 'Yearly' ? 365 : item.duration === 'Half-Yearly' ? 180 : item.duration === 'Quarterly' ? 90 : 30;
              const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
              
              await prisma.subscription.create({
                data: {
                  domainId: item.domainId,
                  domainName: item.domainName,
                  planName: item.planName || item.plan?.name || "Trial", 
                  duration: item.duration || "Monthly",
                  status: "Active",
                  userId: userId || null,
                  endDate
                }
              });
            }
          }
        }
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

      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      const adminMailOptions = {
        from: emailFrom,
        to: process.env.ADMIN_EMAIL || "info@celnet.in",
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
          `<p style="font-size:12px;color:#64748b;margin:0;">Questions? Email <a href="mailto:info@celnet.in" style="color:#1e3a6e;font-weight:600;">info@celnet.in</a> or call <strong>+91-120-4781200</strong></p>`+
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
            status: 'New',
          }
        });
      } catch (dbErr) {
        console.error('Failed to save contact inquiry to DB:', dbErr);
        // Non-blocking — still send email
      }

      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      const adminMailOptions = {
        from: emailFrom,
        to: process.env.ADMIN_EMAIL || "info@celnet.in",
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
          `<p style="margin:3px 0;font-size:13px;color:#e2e8f0;">📧 <a href="mailto:info@celnet.in" style="color:#93c5fd;">info@celnet.in</a></p>`+
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
                  <strong>STM Digital Library</strong> | info@celnet.in
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

  // Send Quotation Email
  app.post("/api/quotation/send", async (req, res) => {
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
            <p style="color:#93c5fd;margin:0 0 16px;font-size:13px;font-weight:500;letter-spacing:0.5px;">A Division of Consortium eLearning Network Pvt. Ltd.</p>
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
                      <td style="color:#1e293b;font-size:13px;font-weight:700;padding:5px 0;border-bottom:1px solid #fde68a;">Consortium eLearning Network Pvt. Ltd.</td>
                    </tr>
                    <tr>
                      <td style="color:#92400e;font-size:12px;padding:5px 0;border-bottom:1px solid #fde68a;">Account Number</td>
                      <td style="color:#1e293b;font-size:13px;font-weight:700;padding:5px 0;border-bottom:1px solid #fde68a;">03942000001153</td>
                    </tr>
                    <tr>
                      <td style="color:#92400e;font-size:12px;padding:5px 0;border-bottom:1px solid #fde68a;">Bank Name</td>
                      <td style="color:#1e293b;font-size:13px;font-weight:700;padding:5px 0;border-bottom:1px solid #fde68a;">HDFC Bank</td>
                    </tr>
                    <tr>
                      <td style="color:#92400e;font-size:12px;padding:5px 0;border-bottom:1px solid #fde68a;">Branch</td>
                      <td style="color:#1e293b;font-size:13px;font-weight:600;padding:5px 0;border-bottom:1px solid #fde68a;">Sector-62, Noida, U.P., India</td>
                    </tr>
                    <tr>
                      <td style="color:#92400e;font-size:12px;padding:5px 0;">IFSC Code</td>
                      <td style="color:#1e293b;font-size:13px;font-weight:700;padding:5px 0;">HDFC0002649</td>
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
                        📧 &nbsp;<a href="mailto:info@celnet.in" style="color:#2563eb;text-decoration:none;font-weight:600;">info@celnet.in</a>
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
                  <p style="color:#64748b;font-size:12px;margin:0;">Consortium eLearning Network Pvt. Ltd.</p>
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
              © ${new Date().getFullYear()} Consortium eLearning Network Pvt. Ltd. All rights reserved.
            </p>
            <p style="color:#475569;font-size:11px;margin:0;">
              GSTIN: 09AACCC6494M1Z1 &nbsp;|&nbsp; PAN: AACCC6494M &nbsp;|&nbsp; CIN: U80302DL2005PTC138759
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
        to: [userEmail, process.env.ADMIN_EMAIL || "info@celnet.in"],
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
          sentEmailHtml: htmlForDb,
          planType: subscriptionDuration,
          createdBy: creatorEmail
        },
        create: {
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
          planType: subscriptionDuration,
          userId: userId || null,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          sentEmailHtml: htmlForDb,
          createdBy: creatorEmail
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
      const { userEmail, userName, invoiceData, pdfBase64 } = req.body;
      
      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      const mailOptions = {
        from: emailFrom,
        to: [userEmail, process.env.ADMIN_EMAIL || "info@celnet.in"],
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

      await sendMail(mailOptions);
      res.json({ status: "success", message: "Invoice sent successfully" });
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
         const authUser = await (prisma as any).user.findUnique({ where: { id: req.user.uid } });
         targetInstitutionId = authUser?.institutionId;
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
         const authUser = await (prisma as any).user.findUnique({ where: { id: req.user.uid } });
         targetInstitutionId = authUser?.institutionId;
      }

      const students = await prisma.user.findMany({ where: { institutionId: targetInstitutionId, role: "Student" } });
      const activities = await prisma.studentActivity.findMany({
        where: { user: { institutionId: targetInstitutionId } },
        include: { user: true, content: true }
      });

      // Star Reader
      const userActivityMap = new Map();
      activities.forEach(a => {
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

      const OR_clauses: any[] = [{ userId: req.user.uid }];
      
      // institutionId is stored on the User record and embedded in JWT at login
      let instId = req.user.institutionId;
      if (!instId) {
        // Fallback: load from DB for older tokens
        const u = await prisma.user.findUnique({ where: { id: req.user.uid }, select: { institutionId: true } });
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
      const user = await prisma.user.findUnique({ where: { id: req.user.uid } });
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

      await prisma.user.update({
        where: { id: req.user.uid },
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



  app.get("/api/institution/students", authenticateJWT, async (req: any, res) => {
    try {
      if (req.user.role !== 'Institution' && req.user.role !== 'SuperAdmin') return res.status(403).json({ error: "Unauthorized" });
      
      let targetInstitutionId = req.query.institutionId;
      if (req.user.role === 'Institution') {
         const authUser = await (prisma as any).user.findUnique({ where: { id: req.user.uid } });
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
      const { name, email, password } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email and password are required" });
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return res.status(409).json({ error: "A user with this email already exists" });

      const hashed = await bcrypt.hash(password, 10);

      // Carry the institution's name and properly link relational institutionId
      let institutionName = '';
      let targetInstitutionId = undefined;
      
      if (req.user.role === 'Institution') {
        const institutionUser = await (prisma as any).user.findUnique({ where: { id: req.user.uid }, select: { organization: true, institutionId: true } });
        institutionName = institutionUser?.organization || '';
        targetInstitutionId = institutionUser?.institutionId;
      }

      const student = await (prisma as any).user.create({
        data: {
          email,
          password: hashed,
          displayName: name,
          role: 'Student',
          organization: institutionName,
          institutionId: targetInstitutionId
        }
      });
      const { password: _, ...safe } = student;
      res.json(safe);
    } catch(err: any) {
      console.error('POST /api/institution/students error:', err?.message);
      res.status(500).json({ error: "Failed to create student", detail: err?.message });
    }
  });

  app.post("/api/institution/students/:id/block", authenticateJWT, async (req: any, res) => {
    try {
      if (req.user.role !== 'Institution' && req.user.role !== 'SuperAdmin') return res.status(403).json({ error: "Unauthorized" });
      
      const { id } = req.params;
      const { isBlocked } = req.body;
      
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
      const { displayName, email } = req.body;

      if (email) {
        const taken = await prisma.user.findFirst({ where: { email, id: { not: id } } });
        if (taken) return res.status(409).json({ error: "Email already in use" });
      }

      const updated = await prisma.user.update({
        where: { id },
        data: {
          ...(displayName ? { displayName } : {}),
          ...(email ? { email } : {}),
        }
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
  const LINK_BATCH_SIZE = 10;

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

  // ── Per-file viewability check ─────────────────────────────────────────────
  const validateFileViewability = async (
    url: string,
    contentType: string
  ): Promise<{ isViewable: boolean; viewerStatus: string; flaggedReason?: string }> => {
    if (!url || url.trim().length === 0) {
      return { isViewable: false, viewerStatus: "No File", flaggedReason: "No file URL is set for this content item." };
    }

    // Validate URL structure — malformed URLs crash new URL() and would kill the engine
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return { isViewable: false, viewerStatus: "No File", flaggedReason: `Invalid URL protocol: ${parsed.protocol}` };
      }
    } catch {
      return { isViewable: false, viewerStatus: "No File", flaggedReason: `Malformed URL — cannot parse: "${url.slice(0, 80)}"` };
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

    try {
      // ── Step 1: HEAD check (fast status verification) ───────────────────────
      const headCtrl = new AbortController();
      const headTid = setTimeout(() => headCtrl.abort(), 6000);
      const headRes = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; STMLibraryValidator/2.0)" },
        signal: headCtrl.signal as any,
      }).catch(() => null);
      clearTimeout(headTid);

      if (!headRes) {
        return { isViewable: false, viewerStatus: "Timeout", flaggedReason: "File URL did not respond within 6 seconds (HEAD)." };
      }
      if (headRes.status >= 400) {
        return { isViewable: false, viewerStatus: "Load Failed", flaggedReason: `Server returned HTTP ${headRes.status} for file URL.` };
      }

      // ── Step 2: Video — HEAD OK is sufficient ───────────────────────────────
      if (isVideo) {
        return { isViewable: true, viewerStatus: "Rendered OK" };
      }

      // ── Step 3: PDF — Fetch first 8 bytes and verify %PDF magic bytes ───────
      if (isPdf) {
        const getCtrl = new AbortController();
        const getTid = setTimeout(() => getCtrl.abort(), 10000);
        const getRes = await fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; STMLibraryValidator/2.0)",
            Range: "bytes=0-7",
          },
          signal: getCtrl.signal as any,
        }).catch(() => null);
        clearTimeout(getTid);

        if (!getRes) {
          return { isViewable: false, viewerStatus: "Timeout", flaggedReason: "Failed to fetch file bytes within 10 seconds." };
        }
        if (getRes.status >= 400) {
          return { isViewable: false, viewerStatus: "Load Failed", flaggedReason: `GET request returned HTTP ${getRes.status}.` };
        }

        const buf = await getRes.arrayBuffer();
        const bytes = new Uint8Array(buf.slice(0, 5));
        const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);

        if (magic.startsWith("%PDF")) {
          return { isViewable: true, viewerStatus: "Rendered OK" };
        }

        // Some servers ignore Range header and return the full file — check content-type header
        const ct = getRes.headers.get("content-type") || "";
        if (ct.includes("pdf")) {
          return { isViewable: true, viewerStatus: "Rendered OK" };
        }

        return {
          isViewable: false,
          viewerStatus: "Load Failed",
          flaggedReason: `File does not appear to be a valid PDF (magic bytes: "${magic.substring(0, 4)}"). Expected "%PDF".`,
        };
      }

      // ── Step 4: Unknown type — treat HEAD 2xx as OK ─────────────────────────
      return { isViewable: true, viewerStatus: "Rendered OK" };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return { isViewable: false, viewerStatus: "Timeout", flaggedReason: "File URL connection timed out." };
      }
      return { isViewable: false, viewerStatus: "Load Failed", flaggedReason: `Network error: ${err?.message || "Unknown"}` };
    }
  };

  // ── Main viewer validation runner ──────────────────────────────────────────
  const VIEWER_BATCH_SIZE = 8;

  const runViewerValidationEngine = async (type: "Manual" | "Automatic") => {
    if (currentViewerValidationProgress.isRunning) return;

    try {
      const contents = await prisma.content.findMany({
        where: { status: { not: "Draft" } },
        select: { id: true, title: true, contentType: true, fileUrl: true },
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
        const batch = contents.slice(i, i + VIEWER_BATCH_SIZE);

        currentViewerValidationProgress.currentTask = `Validating items ${i + 1}–${Math.min(i + VIEWER_BATCH_SIZE, contents.length)} of ${contents.length}…`;

        await Promise.all(
          batch.map(async (c) => {
            try {
              const result = await validateFileViewability(c.fileUrl || "", c.contentType);

              // Persist per-content validation status
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
      const { contentIds } = req.body;
      if (!Array.isArray(contentIds) || contentIds.length === 0) {
        return res.status(400).json({ error: "contentIds array is required." });
      }

      const contents = await prisma.content.findMany({
        where: { id: { in: contentIds } },
        select: { id: true, title: true, contentType: true, fileUrl: true },
      });

      const results: any[] = [];
      for (const c of contents) {
        const result = await validateFileViewability(c.fileUrl || "", c.contentType);
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
        to: process.env.ADMIN_EMAIL || "info@celnet.in",
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
          `<p style="font-size:12px;color:#64748b;margin:0;">We'll respond within <strong>2–3 business days</strong> at <strong>${email}</strong>. For urgent queries: <a href="mailto:info@celnet.in" style="color:#1e3a6e;font-weight:600;">info@celnet.in</a></p>`+
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
