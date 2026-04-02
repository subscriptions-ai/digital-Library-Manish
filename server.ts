import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from 'cors';

// Import routers
import { authRouter } from "./src/backend/routes/auth";
import { usersRouter } from "./src/backend/routes/users";
import { subscriptionsRouter } from "./src/backend/routes/subscriptions";
import { paymentsRouter } from "./src/backend/routes/payments";
import { quotationsRouter } from "./src/backend/routes/quotations";
import { invoicesRouter } from "./src/backend/routes/invoices";
import { contentRouter } from "./src/backend/routes/content";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' })); // Large limit for PDF base64 uploads

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/subscriptions', subscriptionsRouter);
  app.use('/api/payment', paymentsRouter);
  app.use('/api/quotations', quotationsRouter);
  app.use('/api/invoices', invoicesRouter);
  app.use('/api/content', contentRouter);

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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
