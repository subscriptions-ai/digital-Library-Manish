import { PrismaClient } from '@prisma/client';
import { generateFingerprint } from '../lib/dedup.js';
import { classifyContent } from '../lib/aiClassifier.js';
import { validateContentUrl } from '../lib/pdfValidator.js';

const prisma = new PrismaClient();

export function setupExtractionRoutes(app: any, authenticateJWT: any, requireSuperAdmin: any) {
  
  // Create a new extraction job
  app.post("/api/admin/extraction/jobs", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const { name, sourceType, sourceConfig, targetDomain, targetContentType } = req.body;
      
      const job = await prisma.extractionJob.create({
        data: {
          name,
          sourceType,
          sourceConfig,
          targetDomain,
          targetContentType,
          status: "Pending"
        }
      });
      
      res.json(job);
    } catch (error) {
      console.error("Create job error:", error);
      res.status(500).json({ error: "Failed to create extraction job" });
    }
  });

  // Get all jobs
  app.get("/api/admin/extraction/jobs", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const jobs = await prisma.extractionJob.findMany({
        orderBy: { createdAt: 'desc' }
      });
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // Get job details with items
  app.get("/api/admin/extraction/jobs/:id", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const job = await prisma.extractionJob.findUnique({
        where: { id: req.params.id },
        include: {
          items: {
            take: 100, // Just return first 100 for now to avoid huge payloads
            orderBy: { createdAt: 'desc' }
          }
        }
      });
      if (!job) return res.status(404).json({ error: "Job not found" });
      res.json(job);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  // Start job
  app.post("/api/admin/extraction/jobs/:id/start", authenticateJWT, requireSuperAdmin, async (req: any, res: any) => {
    try {
      let { items } = req.body; 
      const jobId = req.params.id;
      
      const job = await prisma.extractionJob.findUnique({ where: { id: jobId } });
      if (!job) return res.status(404).json({ error: "Job not found" });
      
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: { status: "Running", startedAt: new Date() }
      });
      
      if (job.sourceType === 'OpenAccess') {
        const query = (job.sourceConfig as any)?.searchTopic || job.targetDomain || "Science";
        try {
          const fetchRes = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}%20OPEN_ACCESS:Y&format=json&resultType=core&pageSize=10`);
          const data = await fetchRes.json();
          items = [];
          if (data && data.resultList && data.resultList.result) {
            for (const result of data.resultList.result) {
              const urlInfo = result.fullTextUrlList?.fullTextUrl?.find((u: any) => u.documentStyle === 'pdf');
              if (urlInfo && urlInfo.url) {
                items.push({
                  url: urlInfo.url,
                  title: result.title,
                  authors: result.authorString,
                  description: result.abstractText || ""
                });
              }
            }
          }
        } catch (err) {
          console.error("OpenAccess Discovery Error:", err);
        }
      }
      
      // Start processing asynchronously so we don't block the request
      if (items && items.length > 0) {
        processJobItems(job, items).catch(console.error);
        res.json({ success: true, message: `Job started in background with ${items.length} discovered items.` });
      } else {
        await prisma.extractionJob.update({
          where: { id: jobId },
          data: { status: "Failed", completedAt: new Date(), errorLog: [{ error: "No items discovered" }] }
        });
        res.json({ success: false, message: "No open access items discovered for this query." });
      }
      
    } catch (error) {
      res.status(500).json({ error: "Failed to start job" });
    }
  });
}

async function processJobItems(job: any, rawItems: any[]) {
  let processed = 0;
  let duplicates = 0;
  let flagged = 0;
  let failed = 0;
  
  for (const raw of rawItems) {
    try {
      // 1. Create pending item
      const item = await prisma.extractionItem.create({
        data: {
          jobId: job.id,
          rawData: raw,
          status: "Pending"
        }
      });
      
      // 2. Classify with AI
      const classification = await classifyContent(raw);
      
      const fingerprint = generateFingerprint(classification.title, classification.authors);
      
      // 3. Deduplication check
      const existing = await prisma.content.findUnique({ where: { fingerprint } });
      
      if (existing) {
        await prisma.extractionItem.update({
          where: { id: item.id },
          data: {
            aiResult: classification as any,
            fingerprint,
            status: "Duplicate"
          }
        });
        duplicates++;
        processed++;
        continue;
      }
      
      // 4. Validate PDF
      let validationResult: any = null;
      let isFlagged = classification.confidence < 0.7;
      
      if (raw.url) {
        validationResult = await validateContentUrl(raw.url, classification.contentType === 'Educational Videos' ? 'video/mp4' : 'application/pdf');
        if (!validationResult.isValid) {
          isFlagged = true;
        }
      }
      
      await prisma.extractionItem.update({
        where: { id: item.id },
        data: {
          aiResult: classification as any,
          fingerprint,
          title: classification.title,
          authors: classification.authors,
          description: classification.description,
          domain: job.targetDomain || classification.domain,
          contentType: job.targetContentType || classification.contentType,
          subjectArea: classification.subjectArea,
          tags: classification.tags as any,
          fileUrl: raw.url,
          confidence: classification.confidence,
          validationResult: validationResult as any,
          status: isFlagged ? "Flagged" : "Validated"
        }
      });
      
      if (isFlagged) flagged++;
      processed++;
      
    } catch (e: any) {
      failed++;
      processed++;
      console.error("Item processing failed:", e);
    }
    
    // Update job stats periodically
    if (processed % 5 === 0) {
      await prisma.extractionJob.update({
        where: { id: job.id },
        data: { 
          totalProcessed: processed,
          totalDuplicates: duplicates,
          totalFlagged: flagged,
          totalFailed: failed
        }
      });
    }
  }
  
  // Final update
  await prisma.extractionJob.update({
    where: { id: job.id },
    data: { 
      status: "Completed",
      completedAt: new Date(),
      totalProcessed: processed,
      totalDuplicates: duplicates,
      totalFlagged: flagged,
      totalFailed: failed
    }
  });
}
