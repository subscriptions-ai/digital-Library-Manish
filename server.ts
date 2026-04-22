import express from "express";

if (!(crypto as any).hash) {
  (crypto as any).hash = function(algo: string, data: any, encoding: any) {
    return crypto.createHash(algo).update(data).digest(encoding);
  };
}
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Razorpay from "razorpay";
import nodemailer from "nodemailer";
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

  // Public Stats for Home Page
  app.get("/api/public/counts", async (req, res) => {
    try {
      const [books, periodicals, theses, videos] = await Promise.all([
        prisma.content.count({ where: { contentType: "Books" } }),
        prisma.content.count({ where: { contentType: "Periodicals" } }),
        prisma.content.count({ where: { contentType: "Theses" } }),
        prisma.content.count({ where: { contentType: "Educational Videos" } })
      ]);

      res.json([
        { label: "Books", value: `${books}+` },
        { label: "Periodicals", value: `${periodicals}+` },
        { label: "Theses", value: `${theses}+` },
        { label: "Educational Videos", value: `${videos}+` }
      ]);
    } catch (error) {
      console.error("Public counts error:", error);
      res.status(500).json({ error: "Failed to fetch counts" });
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
          role: email === "subscriptions@stmjournals.com" ? "SuperAdmin" : "Subscriber",
          status: "Active",
        }
      });

      const token = jwt.sign({ uid: userObj.id, email, role: userObj.role }, JWT_SECRET, { expiresIn: '24h' });
      
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

  // Admin: Get all stats (enhanced)
  app.get("/api/admin/stats", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
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
        geoPoints,
        _stats: {
          totalUsers,
          totalContent,
          totalRevenue: payments.filter(p => p.status === 'Success').reduce((acc, p) => acc + p.amount, 0),
          activeSubscriptions: subscriptions.filter(s => s.status === 'Active').length,
          pendingRequests,
          contentGrowthPct: 12.5, // Mocked growth format
          revenueGrowthPct: 8.2,
          userGrowthPct: 15.4
        }
      });
    } catch (error) {
      console.error("Admin stats error:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
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
      const activity = await prisma.studentActivity.findUnique({
        where: { userId_contentId: { userId: req.user.uid, contentId: req.params.contentId } }
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
      const where: any = {};
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
        // For onlyUnlocked, we must fetch all matching query, filter in memory due to complex fuzzy access rules, then paginate.
        const allContents = await prisma.content.findMany({ where, orderBy: { title: 'asc' } });
        const activeSubs = await getUserActiveSubscriptions(userDetails.uid, userDetails.role, userDetails.institutionId);
        
        const unlockedContents = allContents.filter(c => checkContentAccess(c, userDetails.role, activeSubs)).map(c => ({ ...c, locked: false }));
        const paginated = unlockedContents.slice(skip, skip + take);
        
        return res.json({ data: paginated, total: unlockedContents.length, page: parseInt(page as string), limit: take });
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
      const content = await prisma.content.findUnique({ where: { id: contentId } });
      
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
      const content = await prisma.content.findUnique({ where: { id: contentId } });
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
      const protocol = upstreamUrl.protocol === 'https:' ? https.default : http.default;

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
          const redirectProtocol = finalRedirectUrl.startsWith('https') ? https.default : http.default;
          
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

  const requireAdminOrManager = (req: any, res: any, next: any) => {
    const role = req.user?.role;
    if (role !== 'SuperAdmin' && role !== 'SubscriptionManager') {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };

  // Helper: generate strong random password
  const generatePassword = (length = 12): string => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    return Array.from(crypto.randomBytes(length))
      .map(b => chars[b % chars.length])
      .join('');
  };

  // Helper: send credentials email
  const sendCredentialsEmail = async (to: string, name: string, password: string) => {
    const siteUrl = process.env.SITE_URL || 'https://library.stmjournals.com';
    try {
      await transporter.sendMail({
        from: `"STM Digital Library" <${process.env.EMAIL_USER}>`,
        to,
        subject: 'Your Digital Library Access Credentials',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f8fafc; border-radius: 12px;">
            <div style="background: #1e293b; padding: 24px; border-radius: 8px; margin-bottom: 24px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 22px;">STM Digital Library</h1>
              <p style="color: #94a3b8; margin: 8px 0 0;">Academic Access Platform</p>
            </div>
            <h2 style="color: #1e293b;">Welcome, ${name}!</h2>
            <p style="color: #475569;">Your Digital Library account has been created. Here are your access credentials:</p>
            <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #64748b; font-weight: bold; width: 140px;">User ID (Email):</td><td style="padding: 8px 0; color: #0f172a; font-weight: bold;">${to}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b; font-weight: bold;">Temporary Password:</td><td style="padding: 8px 0; color: #0f172a; font-family: monospace; letter-spacing: 1px; background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">${password}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b; font-weight: bold;">Login URL:</td><td style="padding: 8px 0;"><a href="${siteUrl}/login" style="color: #2563eb;">${siteUrl}/login</a></td></tr>
              </table>
            </div>
            <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">
              <p style="margin: 0; color: #92400e; font-size: 14px;"><strong>Important:</strong> You will be prompted to change your password on first login. Please keep these credentials safe.</p>
            </div>
            <p style="color: #64748b; font-size: 13px; margin-top: 24px;">If you did not expect this email, please contact <a href="mailto:subscriptions@stmjournals.com" style="color: #2563eb;">subscriptions@stmjournals.com</a>.</p>
          </div>
        `
      });
    } catch (emailErr) {
      console.error("Credentials email failed:", emailErr);
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
      const { name, email, role, institutionId, institutionName, sendEmail, customPassword } = req.body;

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
          institutionId: newInstId || institutionId || undefined
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
      let related = [];
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

      res.json({ success: true, requestId: request.id, message: "Your request has been received. We will contact you shortly." });
    } catch (err) {
      console.error("POST /api/domain-request error:", err);
      res.status(500).json({ error: "Failed to submit request" });
    }
  });

  // ========================
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

  app.get("/api/admin/quotations", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
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

  app.put("/api/admin/quotations/:id", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
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

  app.post("/api/admin/quotations/:id/convert", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
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
  app.post("/api/admin/subscriptions/assign", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
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
  app.get("/api/admin/subscription-requests", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
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

  app.post("/api/admin/subscription-requests/:id/approve", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
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

  app.post("/api/admin/subscription-requests/:id/reject", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
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
  app.get("/api/admin/subscriptions", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
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

  app.put("/api/admin/subscriptions/:id", authenticateJWT, requireSuperAdmin, async (req: any, res) => {
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
      const { userEmail, userName, quotationData, pdfBase64, userId, organization, state } = req.body;
      
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
      
      // Save to PostgreSQL
      await prisma.quotation.create({
        data: {
          id: quotationData.quotationNumber,
          userEmail,
          userName,
          organization: organization || null,
          state: state || null,
          items: quotationData.items || [],
          subtotal: parseFloat(quotationData.subtotal) || 0,
          gstAmount: parseFloat(quotationData.gstAmount) || 0,
          total: parseFloat(quotationData.totalAmount?.toString().replace(/,/g, '')) || 0,
          status: "Sent",
          userId: userId || null,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });

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

  // ==========================================
  // INSTITUTIONAL ROUTES
  // ==========================================
  app.get("/api/institution/stats", authenticateJWT, async (req: any, res) => {
    try {
      if (req.user.role !== 'Institution' && req.user.role !== 'SuperAdmin') return res.status(403).json({ error: "Unauthorized" });
      const targetInstitutionId = req.user.role === 'Institution' ? req.user.uid : req.query.institutionId;
      
      const studentCount = await prisma.user.count({ where: { institutionId: targetInstitutionId, role: "Student" } });
      const recentActivity = await prisma.studentActivity.findMany({ 
        where: { user: { institutionId: targetInstitutionId } }, 
        include: { user: true, content: true },
        take: 5,
        orderBy: { accessedAt: 'desc' }
      });
      
      // Calculate abstract mock analytics
      const interactions = await prisma.studentActivity.count({ where: { user: { institutionId: targetInstitutionId } } });
      
      res.json({ studentCount, activeGrants: studentCount, totalInteractions: interactions, avgLearningTime: '1h 15m', recentActivity: [] });
    } catch(err) {
      res.status(500).json({ error: "Failed to fetch stats" });
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
      res.json({
        institutionName: user.organization,   // read-only
        contactName: user.displayName,
        state: user.state,                    // repurposed as city for now
        // Extended fields live in user metadata; return empty strings for new installs
        contactPhone: '',
        address: '',
        city: '',
        website: '',
        logoUrl: '',
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
      const { contactName, city, logoUrl } = req.body;
      // institutionName (organization) is intentionally EXCLUDED from updates here

      await prisma.user.update({
        where: { id: req.user.uid },
        data: {
          ...(contactName ? { displayName: contactName } : {}),
          ...(city ? { state: city } : {}),
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
          const merged = [...new Set([...existingDrafted, ...contentIds])];
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

            currentViewerValidationProgress.scannedItems++;
            currentViewerValidationProgress.validCount = validCount;
            currentViewerValidationProgress.flaggedCount = flaggedCount;
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
