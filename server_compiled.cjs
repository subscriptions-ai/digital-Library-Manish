var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_razorpay = __toESM(require("razorpay"), 1);
var import_nodemailer = __toESM(require("nodemailer"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_helmet = __toESM(require("helmet"), 1);
var import_compression = __toESM(require("compression"), 1);
var import_bcryptjs = __toESM(require("bcryptjs"), 1);
var import_jsonwebtoken = __toESM(require("jsonwebtoken"), 1);
var import_client = require("@prisma/client");
if (!import_crypto.default.hash) {
  import_crypto.default.hash = function(algo, data, encoding) {
    return import_crypto.default.createHash(algo).update(data).digest(encoding);
  };
}
var prisma = new import_client.PrismaClient();
import_dotenv.default.config();
var currentDir = process.cwd();
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = Number(process.env.PORT) || 3e3;
  app.use((0, import_helmet.default)({
    contentSecurityPolicy: false
    // Disable CSP if it interferes with Vite/External resources, or configure properly
  }));
  app.use((0, import_compression.default)());
  app.use(import_express.default.json({ limit: "50mb" }));
  app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
  const JWT_SECRET = process.env.JWT_SECRET || "your-fallback-secret-for-dev-only";
  const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(" ")[1];
      import_jsonwebtoken.default.verify(token, JWT_SECRET, (err, user) => {
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
  const getRazorpay = () => {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error("Razorpay keys are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables.");
    }
    return new import_razorpay.default({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  };
  const transporter = import_nodemailer.default.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER || "",
      pass: process.env.EMAIL_PASS || ""
    }
  });
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("WARNING: Email credentials are missing in environment variables.");
  }
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { email, password, name, organization } = req.body;
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
      }
      const hashedPassword = await import_bcryptjs.default.hash(password, 10);
      const userObj = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          displayName: name,
          organization: organization || "",
          role: email === "subscriptions@stmjournals.com" ? "SuperAdmin" : "Subscriber",
          status: "Active"
        }
      });
      const token = import_jsonwebtoken.default.sign({ uid: userObj.id, email, role: userObj.role }, JWT_SECRET, { expiresIn: "24h" });
      const { password: _, ...profile } = userObj;
      res.json({ token, user: profile });
    } catch (error) {
      console.error("Signup Error:", error);
      res.status(500).json({ error: "Failed to create account" });
    }
  });
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const userObj = await prisma.user.findUnique({ where: { email } });
      if (!userObj) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const isPasswordValid = await import_bcryptjs.default.compare(password, userObj.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const token = import_jsonwebtoken.default.sign(
        { uid: userObj.id, email, role: userObj.role, institutionId: userObj.institutionId },
        JWT_SECRET,
        { expiresIn: "24h" }
      );
      const { password: _, ...profile } = userObj;
      res.json({ token, user: profile });
    } catch (error) {
      console.error("Login Error:", error);
      res.status(500).json({ error: "Failed to login" });
    }
  });
  app.get("/api/auth/me", authenticateJWT, async (req, res) => {
    try {
      const userObj = await prisma.user.findUnique({
        where: { email: req.user.email },
        include: {
          quotations: { orderBy: { createdAt: "desc" } },
          subscriptions: { orderBy: { createdAt: "desc" } },
          submissions: { orderBy: { createdAt: "desc" } }
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
  const requireSuperAdmin = (req, res, next) => {
    if (req.user?.role !== "SuperAdmin") return res.status(403).json({ error: "Access denied" });
    next();
  };
  app.get("/api/admin/stats", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const CONTENT_TYPES = ["Books", "Periodicals", "Magazines", "Case Reports", "Theses", "Conference Proceedings", "Educational Videos", "Newsletters"];
      const [users, payments, subscriptions, quotations, contentCounts, pendingRequests, totalContent] = await Promise.all([
        prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
        prisma.payment.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { user: true } }),
        prisma.subscription.findMany({ orderBy: { createdAt: "desc" }, include: { user: true } }),
        prisma.quotation.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
        Promise.all(CONTENT_TYPES.map(async (ct) => ({
          name: ct,
          value: await prisma.content.count({ where: { contentType: ct } })
        }))),
        prisma.subscriptionRequest.count({ where: { status: "Pending" } }),
        prisma.content.count()
      ]);
      const totalUsers = await prisma.user.count();
      const domainGroups = await prisma.content.groupBy({
        by: ["domain"],
        _count: { id: true },
        where: { domain: { not: null } }
      });
      const domainsData = domainGroups.map((d) => ({
        name: d.domain,
        count: d._count.id
      })).sort((a, b) => b.count - a.count).slice(0, 10);
      const currentMonth = (/* @__PURE__ */ new Date()).toLocaleString("default", { month: "short" });
      const revenueData = [
        { name: "Oct", revenue: 45e3 },
        { name: "Nov", revenue: 52e3 },
        { name: "Dec", revenue: 48e3 },
        { name: "Jan", revenue: 61e3 },
        { name: "Feb", revenue: 59e3 },
        { name: "Mar", revenue: 75e3 },
        { name: currentMonth, revenue: payments.filter((p) => p.status === "Success").reduce((acc, p) => acc + p.amount, 0) || 82e3 }
      ];
      const userGrowthData = [
        { name: "Oct", users: 120 },
        { name: "Nov", users: 145 },
        { name: "Dec", users: 160 },
        { name: "Jan", users: 210 },
        { name: "Feb", users: 250 },
        { name: "Mar", users: 310 },
        { name: currentMonth, users: totalUsers }
      ];
      const contentGrowthData = [
        { name: "Oct", items: Math.floor(totalContent * 0.4) },
        { name: "Nov", items: Math.floor(totalContent * 0.5) },
        { name: "Dec", items: Math.floor(totalContent * 0.65) },
        { name: "Jan", items: Math.floor(totalContent * 0.75) },
        { name: "Feb", items: Math.floor(totalContent * 0.85) },
        { name: "Mar", items: Math.floor(totalContent * 0.95) },
        { name: currentMonth, items: totalContent }
      ];
      const geoPoints = [
        { id: "IND", value: 450, coordinates: [78.9629, 20.5937] },
        // India
        { id: "USA", value: 320, coordinates: [-95.7129, 37.0902] },
        // USA
        { id: "GBR", value: 180, coordinates: [-3.4359, 55.3781] },
        // UK
        { id: "CAN", value: 150, coordinates: [-106.3468, 56.1304] },
        // Canada
        { id: "AUS", value: 120, coordinates: [133.7751, -25.2744] },
        // Australia
        { id: "DEU", value: 90, coordinates: [10.4515, 51.1657] }
        // Germany
      ];
      res.json({
        users,
        payments,
        subscriptions,
        quotations,
        contentTypeCounts: contentCounts.filter((c) => c.value > 0),
        domainsData,
        revenueData,
        userGrowthData,
        contentGrowthData,
        geoPoints,
        _stats: {
          totalUsers,
          totalContent,
          totalRevenue: payments.filter((p) => p.status === "Success").reduce((acc, p) => acc + p.amount, 0),
          activeSubscriptions: subscriptions.filter((s) => s.status === "Active").length,
          pendingRequests,
          contentGrowthPct: 12.5,
          // Mocked growth format
          revenueGrowthPct: 8.2,
          userGrowthPct: 15.4
        }
      });
    } catch (error) {
      console.error("Admin stats error:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });
  app.get("/api/user/dashboard", authenticateJWT, async (req, res) => {
    try {
      const subscriptions = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);
      const payments = await prisma.payment.findMany({ where: { userId: req.user.uid, status: "Success" } });
      const recentViews = await prisma.studentActivity.findMany({
        where: { userId: req.user.uid },
        orderBy: { accessedAt: "desc" },
        take: 6,
        include: { content: true }
      });
      const mappedRecent = recentViews.map((rv) => ({
        id: rv.contentId,
        title: rv.content?.title || "Unknown",
        type: rv.content?.contentType || "Book",
        date: rv.accessedAt.toISOString()
      }));
      const activeSubs = subscriptions;
      const nearestExpiry = activeSubs.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())[0]?.endDate || null;
      const totalSpent = payments.reduce((acc, p) => acc + p.amount, 0);
      const allowedDomains = Array.from(new Set(activeSubs.map((s) => s.domainName).filter(Boolean)));
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
  app.get("/api/user/subscriptions", authenticateJWT, async (req, res) => {
    try {
      const subscriptions = await prisma.subscription.findMany({
        where: { userId: req.user.uid },
        orderBy: { startDate: "desc" }
      });
      res.json(subscriptions);
    } catch (error) {
      res.status(500).json({ error: "Failed to load subscriptions" });
    }
  });
  const getUserActiveSubscriptions = async (uid, role, institutionId) => {
    const OR_clauses = [{ userId: uid }];
    let resolvedInstId = institutionId;
    if (!resolvedInstId && (role === "Student" || role === "Subscriber")) {
      const u = await prisma.user.findUnique({ where: { id: uid }, select: { institutionId: true } });
      if (u?.institutionId) resolvedInstId = u.institutionId;
    }
    if (resolvedInstId) {
      OR_clauses.push({ institutionId: resolvedInstId });
    }
    return prisma.subscription.findMany({
      where: {
        OR: OR_clauses,
        status: "Active",
        endDate: { gt: /* @__PURE__ */ new Date() }
      }
    });
  };
  const checkContentAccess = (content, userRole, activeSubscriptions) => {
    if (userRole === "SuperAdmin" || userRole === "Admin" || userRole === "ContentManager") return true;
    return activeSubscriptions.some((sub) => {
      let domainMatch = false;
      if (sub.domainName && sub.domainName === content.domain) domainMatch = true;
      if (sub.domains) {
        const d = typeof sub.domains === "string" ? JSON.parse(sub.domains) : sub.domains;
        if (Array.isArray(d) && d.includes(content.domain)) domainMatch = true;
      }
      if (!domainMatch) return false;
      if (sub.contentTypes) {
        const ct = typeof sub.contentTypes === "string" ? JSON.parse(sub.contentTypes) : sub.contentTypes;
        if (Array.isArray(ct) && ct.includes(content.contentType)) return true;
      }
      return false;
    });
  };
  app.get("/api/user/content-access", authenticateJWT, async (req, res) => {
    try {
      const activeSubscriptions = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);
      const allModules = await prisma.contentModule.findMany({ where: { isActive: true } });
      const accessMap = allModules.map((mod) => {
        const mockContent = { domain: mod.domain, contentType: mod.contentType };
        return {
          ...mod,
          hasAccess: checkContentAccess(mockContent, req.user.role, activeSubscriptions)
        };
      });
      const grouped = accessMap.reduce((acc, curr) => {
        if (!acc[curr.domain]) acc[curr.domain] = [];
        acc[curr.domain].push(curr);
        return acc;
      }, {});
      res.json(grouped);
    } catch (error) {
      res.status(500).json({ error: "Failed to load access map" });
    }
  });
  app.get("/api/content/list", async (req, res) => {
    try {
      const { domain } = req.query;
      const authHeader = req.headers.authorization;
      let userDetails = null;
      if (authHeader) {
        const token = authHeader.split(" ")[1];
        try {
          userDetails = import_jsonwebtoken.default.verify(token, JWT_SECRET);
        } catch (e) {
        }
      }
      const contents = await prisma.content.findMany({
        where: domain ? { domain: String(domain) } : {},
        orderBy: { title: "asc" }
      });
      if (!userDetails) {
        return res.json(contents.map((c) => ({ ...c, locked: true, fileUrl: null })));
      }
      const activeSubs = await getUserActiveSubscriptions(userDetails.uid, userDetails.role, userDetails.institutionId);
      const protectedContents = contents.map((c) => {
        const hasAccess = checkContentAccess(c, userDetails.role, activeSubs);
        if (!hasAccess) {
          return { ...c, fileUrl: null, locked: true };
        }
        return { ...c, locked: false };
      });
      res.json(protectedContents);
    } catch (error) {
      res.status(500).json({ error: "Failed to load content list" });
    }
  });
  app.get("/api/content/:id/view", authenticateJWT, async (req, res) => {
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
      if (req.user.role === "Student" || req.user.role === "Subscriber") {
        try {
          await prisma.studentActivity.create({
            data: {
              userId: req.user.uid,
              contentId: content.id,
              timeSpent: 0
              // initial open trigger, timeSpent updated async later
            }
          });
        } catch (e) {
          console.error("Activity log failed", e);
        }
      }
      return res.json({
        url: content.fileUrl,
        title: content.title,
        contentType: content.contentType
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to view content" });
    }
  });
  app.get("/api/content/:id/proxy-pdf", authenticateJWT, async (req, res) => {
    try {
      const contentId = req.params.id;
      const content = await prisma.content.findUnique({ where: { id: contentId } });
      if (!content || !content.fileUrl) {
        return res.status(404).json({ error: "Content not found" });
      }
      const activeSubs = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);
      const hasAccess = checkContentAccess(content, req.user.role, activeSubs);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied." });
      }
      const https = await import("https");
      const http = await import("http");
      const upstreamUrl = new URL(content.fileUrl);
      const protocol = upstreamUrl.protocol === "https:" ? https.default : http.default;
      const proxyReq = protocol.get(content.fileUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; STMDigitalLibrary/1.0)",
          "Accept": "application/pdf,*/*"
        }
      }, (proxyRes) => {
        if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode || 0) && proxyRes.headers.location) {
          const redirectUrl = proxyRes.headers.location;
          const redirectProtocol = redirectUrl.startsWith("https") ? https.default : http.default;
          const redirReq = redirectProtocol.get(redirectUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; STMDigitalLibrary/1.0)", "Accept": "application/pdf,*/*" }
          }, (redirRes) => {
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", "inline");
            res.setHeader("Cache-Control", "private, max-age=3600");
            res.setHeader("X-Content-Type-Options", "nosniff");
            redirRes.pipe(res);
          });
          redirReq.on("error", () => res.status(502).json({ error: "PDF proxy redirect failed" }));
          return;
        }
        if ((proxyRes.statusCode || 500) >= 400) {
          return res.status(proxyRes.statusCode || 502).json({ error: `Upstream returned ${proxyRes.statusCode}` });
        }
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.setHeader("X-Content-Type-Options", "nosniff");
        if (proxyRes.headers["content-length"]) {
          res.setHeader("Content-Length", proxyRes.headers["content-length"]);
        }
        proxyRes.pipe(res);
      });
      proxyReq.on("error", (err) => {
        console.error("[proxy-pdf] Error fetching upstream:", err.message);
        if (!res.headersSent) res.status(502).json({ error: "Failed to fetch PDF from upstream" });
      });
      req.on("close", () => proxyReq.destroy());
    } catch (error) {
      console.error("[proxy-pdf] unexpected error:", error);
      res.status(500).json({ error: "PDF proxy failed" });
    }
  });
  app.get("/api/user/invoices", authenticateJWT, async (req, res) => {
    try {
      const payments = await prisma.payment.findMany({
        where: { userId: req.user.uid },
        orderBy: { createdAt: "desc" }
      });
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: "Failed to load invoices" });
    }
  });
  app.put("/api/user/profile", authenticateJWT, async (req, res) => {
    try {
      const { displayName, password, clearFirstLogin } = req.body;
      const dataToUpdate = {};
      if (displayName) dataToUpdate.displayName = displayName;
      if (password) {
        dataToUpdate.password = await import_bcryptjs.default.hash(password, 10);
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
  const requireAdminOrManager = (req, res, next) => {
    const role = req.user?.role;
    if (role !== "SuperAdmin" && role !== "SubscriptionManager") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
  const generatePassword = (length = 12) => {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
    return Array.from(import_crypto.default.randomBytes(length)).map((b) => chars[b % chars.length]).join("");
  };
  const sendCredentialsEmail = async (to, name, password) => {
    const siteUrl = process.env.SITE_URL || "https://library.stmjournals.com";
    try {
      await transporter.sendMail({
        from: `"STM Digital Library" <${process.env.EMAIL_USER}>`,
        to,
        subject: "Your Digital Library Access Credentials",
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
    }
  };
  app.get("/api/admin/users", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { role: filterRole, search } = req.query;
      const where = {};
      if (filterRole && filterRole !== "all") where.role = filterRole;
      if (search) {
        where.OR = [
          { email: { contains: search, mode: "insensitive" } },
          { displayName: { contains: search, mode: "insensitive" } }
        ];
      }
      const users = await prisma.user.findMany({
        where,
        include: {
          subscriptions: { where: { status: "Active" }, take: 3 },
          payments: { orderBy: { createdAt: "desc" }, take: 3 }
        },
        orderBy: { createdAt: "desc" }
      });
      const sanitized = users.map(({ password: _, ...u }) => u);
      res.json(sanitized);
    } catch (err) {
      console.error("GET /api/admin/users error:", err);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });
  app.get("/api/admin/institutions", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const institutions = await prisma.institution.findMany({
        select: { id: true, name: true, status: true },
        orderBy: { name: "asc" }
      });
      res.json(Array.isArray(institutions) ? institutions : []);
    } catch (err) {
      res.json([]);
    }
  });
  app.post("/api/admin/users/create", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { name, email, role, institutionId, institutionName, sendEmail, customPassword } = req.body;
      if (!name || !email || !role) {
        return res.status(400).json({ error: "Name, email and role are required" });
      }
      if (role === "Institution" && !institutionName) {
        return res.status(400).json({ error: "Institution Name is required for Institution role" });
      }
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return res.status(409).json({ error: "A user with this email already exists" });
      const plainPassword = customPassword || generatePassword();
      const hashedPassword = await import_bcryptjs.default.hash(plainPassword, 10);
      let newInstId = null;
      if (role === "Institution") {
        const newInst = await prisma.institution.create({
          data: {
            name: institutionName,
            status: "Active"
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
          status: "Active",
          isFirstLogin: true,
          organization: institutionName || void 0,
          institutionId: newInstId || institutionId || void 0
        }
      });
      await prisma.usageLog.create({
        data: {
          action: "USER_CREATED",
          details: `User ${email} created with role ${role} by ${req.user.email}`,
          userId: req.user.uid
        }
      });
      if (sendEmail !== false) {
        await sendCredentialsEmail(email, name, plainPassword);
      }
      const { password: _, ...profile } = newUser;
      res.json({
        user: profile,
        credentials: { email, password: plainPassword }
        // returned once for admin to copy
      });
    } catch (err) {
      console.error("Create user error:", err);
      res.status(500).json({ error: "Failed to create user" });
    }
  });
  app.put("/api/admin/users/:id", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { id } = req.params;
      const { displayName, email, role, organization } = req.body;
      if (role === "SuperAdmin" && req.user.role !== "SuperAdmin") {
        return res.status(403).json({ error: "Only SuperAdmins can assign the SuperAdmin role" });
      }
      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "User not found" });
      if (email && email !== existing.email) {
        const taken = await prisma.user.findUnique({ where: { email } });
        if (taken) return res.status(409).json({ error: "Email already in use" });
      }
      const updated = await prisma.user.update({
        where: { id },
        data: {
          ...displayName ? { displayName } : {},
          ...email ? { email } : {},
          ...role ? { role } : {},
          ...organization !== void 0 ? { organization } : {}
        }
      });
      const { password: _, ...profile } = updated;
      res.json({ user: profile });
    } catch (err) {
      console.error("PUT /api/admin/users/:id error:", err);
      res.status(500).json({ error: "Failed to update user" });
    }
  });
  app.put("/api/admin/users/:id/role", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { role } = req.body;
      const { id } = req.params;
      const allowedRoles = ["SuperAdmin", "SubscriptionManager", "Institution", "Student", "Subscriber"];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role value" });
      }
      if (role === "SuperAdmin" && req.user.role !== "SuperAdmin") {
        return res.status(403).json({ error: "Only SuperAdmins can assign the SuperAdmin role" });
      }
      const prevUser = await prisma.user.findUnique({ where: { id } });
      if (!prevUser) return res.status(404).json({ error: "User not found" });
      const updated = await prisma.user.update({ where: { id }, data: { role } });
      await prisma.usageLog.create({
        data: {
          action: "ROLE_CHANGE",
          details: `Role changed from ${prevUser.role} \u2192 ${role} for user ${prevUser.email} by ${req.user.email}`,
          userId: req.user.uid
        }
      });
      const { password: _, ...profile } = updated;
      res.json({ user: profile });
    } catch (err) {
      res.status(500).json({ error: "Failed to update role" });
    }
  });
  app.post("/api/admin/users/:id/reset-password", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { id } = req.params;
      const targetUser = await prisma.user.findUnique({ where: { id } });
      if (!targetUser) return res.status(404).json({ error: "User not found" });
      const newPlain = generatePassword();
      const hashed = await import_bcryptjs.default.hash(newPlain, 10);
      await prisma.user.update({
        where: { id },
        data: { password: hashed, isFirstLogin: true }
      });
      await sendCredentialsEmail(targetUser.email, targetUser.displayName || "User", newPlain);
      await prisma.usageLog.create({
        data: {
          action: "PASSWORD_RESET",
          details: `Password reset for ${targetUser.email} by ${req.user.email}`,
          userId: req.user.uid
        }
      });
      res.json({ message: "Password reset and emailed successfully", password: newPlain });
    } catch (err) {
      res.status(500).json({ error: "Failed to reset password" });
    }
  });
  app.delete("/api/admin/users/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      if (id === req.user.uid) return res.status(400).json({ error: "Cannot delete your own account" });
      await prisma.user.delete({ where: { id } });
      res.json({ message: "User deleted" });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });
  const GST_RATE = 0.18;
  const COMPANY_STATE = "Delhi";
  async function syncContentModuleCounts() {
    const groups = await prisma.content.groupBy({
      by: ["domain", "contentType"],
      where: { status: "Published", domain: { not: null } },
      _count: { id: true }
    });
    for (const g of groups) {
      if (!g.domain) continue;
      await prisma.contentModule.upsert({
        where: { domain_contentType: { domain: g.domain, contentType: g.contentType } },
        create: { domain: g.domain, contentType: g.contentType, totalCount: g._count.id },
        update: { totalCount: g._count.id }
      });
    }
  }
  app.get("/api/content-modules", async (req, res) => {
    try {
      const { domain } = req.query;
      const where = { isActive: true };
      if (domain) where.domain = domain;
      const modules = await prisma.contentModule.findMany({
        where,
        orderBy: [{ domain: "asc" }, { contentType: "asc" }]
      });
      res.json(modules);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch content modules" });
    }
  });
  app.post("/api/content-modules/calculate", async (req, res) => {
    try {
      const { moduleIds, planType, userState } = req.body;
      if (!Array.isArray(moduleIds) || moduleIds.length === 0) {
        return res.json({ subtotal: 0, gstAmount: 0, total: 0, breakdown: [], planType });
      }
      const modules = await prisma.contentModule.findMany({
        where: { id: { in: moduleIds }, isActive: true }
      });
      const breakdown = modules.map((m) => {
        let price = 0;
        if (planType === "Monthly") price = m.monthlyPrice;
        else if (planType === "Quarterly") price = m.quarterlyPrice;
        else if (planType === "Yearly") price = m.yearlyPrice;
        return {
          id: m.id,
          domain: m.domain,
          contentType: m.contentType,
          price,
          totalCount: m.totalCount,
          planType
        };
      });
      const subtotal = breakdown.reduce((sum, b) => sum + b.price, 0);
      const isInterState = userState && userState.toLowerCase() !== COMPANY_STATE.toLowerCase();
      const gstAmount = parseFloat((subtotal * GST_RATE).toFixed(2));
      const total = parseFloat((subtotal + gstAmount).toFixed(2));
      res.json({
        breakdown,
        subtotal,
        gstAmount,
        total,
        planType,
        gstType: isInterState ? "IGST" : "CGST+SGST",
        gstRate: GST_RATE
      });
    } catch (error) {
      console.error("Calculate error:", error);
      res.status(500).json({ error: "Calculation failed" });
    }
  });
  app.get("/api/admin/content-modules", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      await syncContentModuleCounts();
      const modules = await prisma.contentModule.findMany({ orderBy: [{ domain: "asc" }, { contentType: "asc" }] });
      res.json(modules);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch modules" });
    }
  });
  app.put("/api/admin/content-modules/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { monthlyPrice, quarterlyPrice, yearlyPrice, yearlyDiscountPct, isActive } = req.body;
      const data = {};
      if (monthlyPrice !== void 0) data.monthlyPrice = parseFloat(monthlyPrice);
      if (quarterlyPrice !== void 0) data.quarterlyPrice = parseFloat(quarterlyPrice);
      if (yearlyPrice !== void 0) data.yearlyPrice = parseFloat(yearlyPrice);
      if (yearlyDiscountPct !== void 0) data.yearlyDiscountPct = parseFloat(yearlyDiscountPct);
      if (isActive !== void 0) data.isActive = isActive;
      const updated = await prisma.contentModule.update({ where: { id }, data });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update module" });
    }
  });
  app.post("/api/admin/content-modules/sync", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      await syncContentModuleCounts();
      const modules = await prisma.contentModule.findMany({ orderBy: [{ domain: "asc" }, { contentType: "asc" }] });
      res.json({ synced: modules.length, modules });
    } catch (error) {
      res.status(500).json({ error: "Sync failed" });
    }
  });
  app.get("/api/domain-data", async (req, res) => {
    try {
      const domain = req.query.domain;
      if (!domain) return res.status(400).json({ error: "domain query param required" });
      const contentGroups = await prisma.content.groupBy({
        by: ["contentType"],
        where: { domain, status: "Published" },
        _count: { id: true },
        orderBy: { contentType: "asc" }
      });
      const content_summary = contentGroups.map((g) => ({
        type: g.contentType,
        count: g._count.id
      }));
      const modules = await prisma.contentModule.findMany({
        where: { domain, isActive: true },
        orderBy: { contentType: "asc" }
      });
      const pricing_modules = modules.map((m) => ({
        id: m.id,
        type: m.contentType,
        monthlyPrice: m.monthlyPrice,
        quarterlyPrice: m.quarterlyPrice,
        yearlyPrice: m.yearlyPrice,
        yearlyDiscountPct: m.yearlyDiscountPct,
        totalCount: m.totalCount,
        visible: m.isActive
      }));
      res.json({ domain, content_summary, pricing_modules });
    } catch (err) {
      console.error("GET /api/domain-data error:", err);
      res.status(500).json({ error: "Failed to fetch domain data" });
    }
  });
  app.post("/api/domain-request", async (req, res) => {
    try {
      const { userName, email, organization, domain, selectedModules, planType, totalPrice, notes } = req.body;
      if (!userName || !email || !domain) {
        return res.status(400).json({ error: "Name, email and domain are required" });
      }
      const planDesc = `Domain Access Request: ${domain} | Plan: ${planType || "Monthly"} | Modules: ${Array.isArray(selectedModules) ? selectedModules.join(", ") : "All"} | Est. Total: \u20B9${totalPrice || 0}${organization ? ` | Org: ${organization}` : ""}`;
      const request = await prisma.subscriptionRequest.create({
        data: {
          userName,
          email,
          planType: planType || "Monthly",
          durationMonths: planType === "Yearly" ? 12 : planType === "Quarterly" ? 3 : 1,
          planDescription: planDesc,
          notes: notes || null,
          status: "Pending"
        }
      });
      res.json({ success: true, requestId: request.id, message: "Your request has been received. We will contact you shortly." });
    } catch (err) {
      console.error("POST /api/domain-request error:", err);
      res.status(500).json({ error: "Failed to submit request" });
    }
  });
  app.post("/api/quotations", authenticateJWT, async (req, res) => {
    try {
      const {
        userName,
        userEmail,
        organization,
        state,
        planType,
        moduleIds,
        pricingBreakdown,
        subtotal,
        gstAmount,
        total,
        items,
        allowedDomain,
        notes
      } = req.body;
      const expiresAt = /* @__PURE__ */ new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      const quotation = await prisma.quotation.create({
        data: {
          userName,
          userEmail,
          organization,
          state,
          planType: planType || "Monthly",
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
    } catch (error) {
      console.error("Create quotation error:", error);
      res.status(500).json({ error: "Failed to create quotation" });
    }
  });
  app.get("/api/admin/quotations", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { status } = req.query;
      const where = {};
      if (status) where.status = status;
      const quotations = await prisma.quotation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { user: true }
      });
      res.json(quotations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch quotations" });
    }
  });
  app.put("/api/admin/quotations/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      const data = {};
      if (status) data.status = status;
      if (notes !== void 0) data.notes = notes;
      const updated = await prisma.quotation.update({ where: { id }, data });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update quotation" });
    }
  });
  app.post("/api/admin/quotations/:id/convert", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.body;
      const quotation = await prisma.quotation.findUnique({ where: { id } });
      if (!quotation) return res.status(404).json({ error: "Quotation not found" });
      if (!quotation.userId) return res.status(400).json({ error: "Quotation has no linked user; assign manually" });
      const breakdown = quotation.pricingBreakdown || {};
      const allowedTypes = Array.isArray(breakdown.breakdown) ? breakdown.breakdown.map((b) => b.contentType) : [];
      const start = startDate ? new Date(startDate) : /* @__PURE__ */ new Date();
      const end = endDate ? new Date(endDate) : (() => {
        const d = new Date(start);
        const months = quotation.planType === "Yearly" ? 12 : quotation.planType === "Quarterly" ? 3 : 1;
        d.setMonth(d.getMonth() + months);
        return d;
      })();
      const sub = await prisma.subscription.create({
        data: {
          userId: quotation.userId,
          planName: `Custom Package (${quotation.planType})`,
          planType: quotation.planType || "Monthly",
          domainName: quotation.allowedDomain || "All Domains",
          startDate: start,
          endDate: end,
          status: "Active"
        }
      });
      await prisma.quotation.update({ where: { id }, data: { status: "Paid" } });
      res.json({ subscription: sub, quotation: { ...quotation, status: "Paid" } });
    } catch (error) {
      console.error("Convert quotation error:", error);
      res.status(500).json({ error: "Conversion failed" });
    }
  });
  app.get("/api/admin/content", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { domain, contentType, search, page = "1", limit = "10" } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const where = {};
      if (domain) where.domain = domain;
      if (contentType) where.contentType = contentType;
      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { authors: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } }
        ];
      }
      const [contents, total] = await Promise.all([
        prisma.content.findMany({ where, skip, take: parseInt(limit), orderBy: { publishedAt: "desc" } }),
        prisma.content.count({ where })
      ]);
      res.json({ data: contents, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (error) {
      console.error("Admin Content GET Error:", error);
      res.status(500).json({ error: "Failed to fetch content" });
    }
  });
  app.post("/api/admin/content", authenticateJWT, requireSuperAdmin, async (req, res) => {
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
  app.put("/api/admin/content/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      if (data.price !== void 0) data.price = parseFloat(data.price) || 0;
      const updatedContent = await prisma.content.update({ where: { id }, data });
      res.json(updatedContent);
    } catch (error) {
      console.error("Admin Content PUT Error:", error);
      res.status(500).json({ error: "Failed to update content" });
    }
  });
  app.delete("/api/admin/content/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await prisma.content.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      console.error("Admin Content DELETE Error:", error);
      res.status(500).json({ error: "Failed to delete content" });
    }
  });
  app.post("/api/admin/content/bulk", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Invalid payload format. Expected { items: [...] }" });
      }
      const results = { success: 0, failed: 0, errors: [] };
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
              tags: item.tags ? typeof item.tags === "string" ? item.tags.startsWith("[") ? JSON.parse(item.tags) : item.tags.split(",").map((t) => t.trim()) : item.tags : [],
              price: parseFloat(item.price) || 0,
              accessType: item.accessType || "Subscription",
              status: item.status || "Published",
              publishingMode: item.publishingMode || "Direct"
            }
          });
          results.success++;
        } catch (err) {
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
  app.post("/api/admin/content/bulk-action", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { action, contentIds } = req.body;
      if (!action || !Array.isArray(contentIds) || contentIds.length === 0) {
        return res.status(400).json({ error: "Invalid payload. Expected action and contentIds array." });
      }
      if (action === "Delete") {
        await prisma.content.deleteMany({ where: { id: { in: contentIds } } });
      } else if (action === "Publish" || action === "Draft") {
        const statusVal = action === "Publish" ? "Published" : "Draft";
        await prisma.content.updateMany({
          where: { id: { in: contentIds } },
          data: { status: statusVal }
        });
      } else {
        return res.status(400).json({ error: "Unknown action" });
      }
      res.json({ success: true, message: `Successfully applied ${action} to ${contentIds.length} items.` });
    } catch (err) {
      console.error("Bulk Action Error:", err);
      res.status(500).json({ error: err.message || "Failed to process bulk action" });
    }
  });
  app.post("/api/admin/users/:id/block", authenticateJWT, requireSuperAdmin, async (req, res) => {
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
  app.post("/api/admin/subscriptions/assign", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { userIds, bundleId, planType, durationMonths, domains: inputDomains, contentTypes: inputContentTypes } = req.body;
      let finalDomains = [];
      let finalContentTypes = [];
      let finalPlanName = "Custom Plan";
      if (bundleId) {
        const bundle = await prisma.bundle.findUnique({ where: { id: bundleId } });
        if (!bundle) return res.status(404).json({ error: "Bundle not found" });
        finalDomains = Array.isArray(bundle.domains) ? bundle.domains : [];
        finalContentTypes = Array.isArray(bundle.contentTypes) ? bundle.contentTypes : [];
        finalPlanName = bundle.name;
      } else {
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
      const startDate = /* @__PURE__ */ new Date();
      const endDate = new Date(startDate.getTime());
      endDate.setMonth(endDate.getMonth() + dMonths);
      const createdSubs = [];
      const targets = Array.isArray(userIds) ? userIds : [userIds].filter(Boolean);
      if (targets.length === 0) return res.status(400).json({ error: "No users selected" });
      for (const userId of targets) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const isInst = user?.role === "Institution";
        let assignedInstitutionId = null;
        if (isInst) {
          const inst = await prisma.institution.findFirst({ where: { subscriptionId: userId } });
          if (inst) assignedInstitutionId = inst.id;
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
    } catch (error) {
      console.error("Assign subscription error:", error);
      res.status(500).json({ error: error.message || "Failed to assign subscription" });
    }
  });
  app.get("/api/bundles", authenticateJWT, async (req, res) => {
    try {
      const bundles = await prisma.bundle.findMany({
        where: { status: "Active" },
        orderBy: { name: "asc" }
      });
      res.json(bundles);
    } catch (error) {
      console.error("Fetch bundles error:", error);
      res.status(500).json({ error: "Failed to fetch bundles" });
    }
  });
  app.get("/api/admin/subscription-requests", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { status } = req.query;
      const where = {};
      if (status) where.status = status;
      const requests = await prisma.subscriptionRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { user: true, subscription: true }
      });
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch subscription requests" });
    }
  });
  app.post("/api/admin/subscription-requests", async (req, res) => {
    try {
      const { userName, email, planType, durationMonths, planDescription, paymentRef, notes, userId } = req.body;
      const request = await prisma.subscriptionRequest.create({
        data: { userName, email, planType, durationMonths: parseInt(durationMonths) || 1, planDescription, paymentRef, notes, userId }
      });
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to create subscription request" });
    }
  });
  app.post("/api/admin/subscription-requests/:id/approve", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.body;
      const requestObj = await prisma.subscriptionRequest.findUnique({ where: { id } });
      if (!requestObj) return res.status(404).json({ error: "Request not found" });
      const start = startDate ? new Date(startDate) : /* @__PURE__ */ new Date();
      let end;
      if (endDate) {
        end = new Date(endDate);
      } else {
        end = new Date(start);
        end.setMonth(end.getMonth() + (requestObj.durationMonths || 1));
      }
      const subscription = await prisma.subscription.create({
        data: {
          userId: requestObj.userId,
          planName: requestObj.planDescription || requestObj.planType,
          planType: requestObj.planType,
          durationMonths: requestObj.durationMonths,
          startDate: start,
          endDate: end,
          status: "Active",
          requestId: id
        }
      });
      await prisma.subscriptionRequest.update({
        where: { id },
        data: { status: "Approved" }
      });
      res.json({ subscription, request: { ...requestObj, status: "Approved" } });
    } catch (error) {
      console.error("Approve subscription request error:", error);
      res.status(500).json({ error: error.message || "Failed to approve request" });
    }
  });
  app.post("/api/admin/subscription-requests/:id/reject", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { rejectionNote } = req.body;
      const updated = await prisma.subscriptionRequest.update({
        where: { id },
        data: { status: "Rejected", rejectionNote }
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to reject request" });
    }
  });
  app.get("/api/admin/subscriptions", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { status } = req.query;
      const where = {};
      if (status) where.status = status;
      await prisma.subscription.updateMany({
        where: { endDate: { lt: /* @__PURE__ */ new Date() }, status: "Active" },
        data: { status: "Expired" }
      });
      const subscriptions = await prisma.subscription.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { user: true, request: true }
      });
      res.json(subscriptions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch subscriptions" });
    }
  });
  app.put("/api/admin/subscriptions/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, endDate, cancelledAt } = req.body;
      const data = {};
      if (status) data.status = status;
      if (endDate) data.endDate = new Date(endDate);
      if (status === "Cancelled") data.cancelledAt = /* @__PURE__ */ new Date();
      const updated = await prisma.subscription.update({ where: { id }, data });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update subscription" });
    }
  });
  app.post("/api/payment/order", async (req, res) => {
    try {
      const razorpay = getRazorpay();
      const { amount, currency = "INR", receipt } = req.body;
      const options = {
        amount: Math.round(amount * 100),
        // amount in the smallest currency unit
        currency,
        receipt
      };
      const order = await razorpay.orders.create(options);
      res.json(order);
    } catch (error) {
      console.error("Razorpay Order Error:", error);
      res.status(500).json({ error: "Failed to create order" });
    }
  });
  app.post("/api/payment/verify", async (req, res) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, items, userId } = req.body;
      const sign = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSign = import_crypto.default.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "").update(sign.toString()).digest("hex");
      if (razorpay_signature === expectedSign) {
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
              const days = item.duration === "Yearly" ? 365 : item.duration === "Half-Yearly" ? 180 : item.duration === "Quarterly" ? 90 : 30;
              const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1e3);
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
  app.post("/api/quotation/send", async (req, res) => {
    try {
      const { userEmail, userName, quotationData, pdfBase64, userId, organization, state } = req.body;
      const mailOptions = {
        from: process.env.EMAIL_USER || "",
        to: [userEmail, process.env.ADMIN_EMAIL || "admin@stmjournals.com"],
        subject: `Quotation for STM Digital Library - ${quotationData.quotationNumber}`,
        text: `Dear ${userName},

Please find attached the quotation for your requested departments.

Quotation Number: ${quotationData.quotationNumber}
Total Amount: \u20B9${quotationData.totalAmount}

Regards,
STM Digital Library Team`,
        attachments: [
          {
            filename: `Quotation_${quotationData.quotationNumber}.pdf`,
            content: pdfBase64,
            encoding: "base64"
          }
        ]
      };
      await transporter.sendMail(mailOptions);
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
          total: parseFloat(quotationData.totalAmount?.toString().replace(/,/g, "")) || 0,
          status: "Sent",
          userId: userId || null,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3)
        }
      });
      res.json({ status: "success", message: "Quotation sent successfully" });
    } catch (error) {
      console.error("Quotation Email Error:", error);
      res.status(500).json({ error: "Failed to send quotation email" });
    }
  });
  app.post("/api/invoice/send", async (req, res) => {
    try {
      const { userEmail, userName, invoiceData, pdfBase64 } = req.body;
      const mailOptions = {
        from: process.env.EMAIL_USER || "",
        to: [userEmail, process.env.ADMIN_EMAIL || "admin@stmjournals.com"],
        subject: `Invoice for STM Digital Library - ${invoiceData.invoiceNumber}`,
        text: `Dear ${userName},

Thank you for your subscription. Please find attached the tax invoice for your purchase.

Invoice Number: ${invoiceData.invoiceNumber}
Total Amount: \u20B9${invoiceData.grandTotal}

Regards,
STM Digital Library Team`,
        attachments: [
          {
            filename: `Invoice_${invoiceData.invoiceNumber}.pdf`,
            content: pdfBase64,
            encoding: "base64"
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
  app.get("/api/institution/stats", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") return res.status(403).json({ error: "Unauthorized" });
      const targetInstitutionId = req.user.role === "Institution" ? req.user.uid : req.query.institutionId;
      const studentCount = await prisma.user.count({ where: { institutionId: targetInstitutionId, role: "Student" } });
      const recentActivity = await prisma.studentActivity.findMany({
        where: { user: { institutionId: targetInstitutionId } },
        include: { user: true, content: true },
        take: 5,
        orderBy: { accessedAt: "desc" }
      });
      const interactions = await prisma.studentActivity.count({ where: { user: { institutionId: targetInstitutionId } } });
      res.json({ studentCount, activeGrants: studentCount, totalInteractions: interactions, avgLearningTime: "1h 15m", recentActivity: [] });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });
  app.get("/api/institution/subscriptions", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const subscriptions = await prisma.subscription.findMany({
        where: { userId: req.user.uid },
        orderBy: { startDate: "desc" }
      });
      res.json(subscriptions);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch subscriptions" });
    }
  });
  app.get("/api/institution/profile", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const user = await prisma.user.findUnique({ where: { id: req.user.uid } });
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({
        institutionName: user.organization,
        // read-only
        contactName: user.displayName,
        state: user.state,
        // repurposed as city for now
        // Extended fields live in user metadata; return empty strings for new installs
        contactPhone: "",
        address: "",
        city: "",
        website: "",
        logoUrl: ""
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to load profile" });
    }
  });
  app.put("/api/institution/profile", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const { contactName, city, logoUrl } = req.body;
      await prisma.user.update({
        where: { id: req.user.uid },
        data: {
          ...contactName ? { displayName: contactName } : {},
          ...city ? { state: city } : {}
        }
      });
      res.json({ message: "Profile updated successfully" });
    } catch (err) {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });
  app.get("/api/institution/students", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") return res.status(403).json({ error: "Unauthorized" });
      let targetInstitutionId = req.query.institutionId;
      if (req.user.role === "Institution") {
        const authUser = await prisma.user.findUnique({ where: { id: req.user.uid } });
        targetInstitutionId = authUser?.institutionId;
      }
      if (!targetInstitutionId) {
        return res.json([]);
      }
      const students = await prisma.user.findMany({
        where: { institutionId: targetInstitutionId, role: "Student" },
        include: { subscriptions: true, activities: { include: { content: true } } },
        orderBy: { createdAt: "desc" }
      });
      res.json(students);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch students" });
    }
  });
  app.post("/api/institution/students", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const { name, email, password } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email and password are required" });
      }
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return res.status(409).json({ error: "A user with this email already exists" });
      const hashed = await import_bcryptjs.default.hash(password, 10);
      let institutionName = "";
      let targetInstitutionId = void 0;
      if (req.user.role === "Institution") {
        const institutionUser = await prisma.user.findUnique({ where: { id: req.user.uid }, select: { organization: true, institutionId: true } });
        institutionName = institutionUser?.organization || "";
        targetInstitutionId = institutionUser?.institutionId;
      }
      const student = await prisma.user.create({
        data: {
          email,
          password: hashed,
          displayName: name,
          role: "Student",
          organization: institutionName,
          institutionId: targetInstitutionId
        }
      });
      const { password: _, ...safe } = student;
      res.json(safe);
    } catch (err) {
      console.error("POST /api/institution/students error:", err?.message);
      res.status(500).json({ error: "Failed to create student", detail: err?.message });
    }
  });
  app.post("/api/institution/students/:id/block", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") return res.status(403).json({ error: "Unauthorized" });
      const { id } = req.params;
      const { isBlocked } = req.body;
      const student = await prisma.user.update({
        where: { id },
        data: { isBlocked }
      });
      res.json(student);
    } catch (err) {
      res.status(500).json({ error: "Failed to block student" });
    }
  });
  app.put("/api/institution/students/:id", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") {
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
          ...displayName ? { displayName } : {},
          ...email ? { email } : {}
        }
      });
      const { password: _, ...profile } = updated;
      res.json({ user: profile });
    } catch (err) {
      res.status(500).json({ error: "Failed to update student" });
    }
  });
  app.delete("/api/institution/students/:id", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const { id } = req.params;
      await prisma.user.delete({ where: { id } });
      res.json({ message: "Student removed" });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete student" });
    }
  });
  app.post("/api/student/activity", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Student" && req.user.role !== "Subscriber") return res.status(403).json({ error: "Unauthorized" });
      const { contentId, timeSpent } = req.body;
      const activity = await prisma.studentActivity.create({
        data: {
          userId: req.user.uid,
          contentId,
          timeSpent: parseInt(timeSpent) || 0
        }
      });
      res.json(activity);
    } catch (err) {
      res.status(500).json({ error: "Failed to log activity" });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(import_express.default.static(import_path.default.join(currentDir, "dist")));
    app.get("*", (req, res) => res.sendFile(import_path.default.join(currentDir, "dist/index.html")));
  }
  app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({ error: "Internal server error" });
  });
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} (Mode: ${process.env.NODE_ENV || "development"})`);
  });
}
startServer();
