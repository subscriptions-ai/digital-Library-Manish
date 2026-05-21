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
      const jobId = req.params.id;
      
      const job = await prisma.extractionJob.findUnique({ where: { id: jobId } });
      if (!job) return res.status(404).json({ error: "Job not found" });
      
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: { status: "Running", startedAt: new Date() }
      });
      
      // Start Mass Extraction in background
      if (job.sourceType === 'AutomatedMassScraper') {
        runMassExtraction(job).catch(console.error);
        return res.json({ success: true, message: `Mass Extraction started for ${job.targetDomain}.` });
      }

      res.json({ success: false, message: "Unknown source type" });
    } catch (error) {
      res.status(500).json({ error: "Failed to start job" });
    }
  });
}

async function runMassExtraction(job: any) {
  let processed = 0;
  let duplicates = 0;
  let flagged = 0;
  let failed = 0;
  
  const query = `${job.targetDomain} ${job.targetContentType === 'Books' ? 'book' : ''}`.trim();
  
  try {
    // Fetch up to 100 items per batch to simulate mass extraction
    const fetchRes = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}%20OPEN_ACCESS:Y&format=json&resultType=core&pageSize=100`);
    const data = await fetchRes.json();
    
    if (data && data.resultList && data.resultList.result) {
      const results = data.resultList.result;
      
      for (const result of results) {
        try {
          const urlInfo = result.fullTextUrlList?.fullTextUrl?.find((u: any) => u.documentStyle === 'pdf');
          if (!urlInfo || !urlInfo.url) continue; // Skip if no PDF

          const title = result.title || "Untitled";
          const authors = result.authorString || "Unknown";
          const description = result.abstractText || `Open access content from ${result.journalTitle || 'Europe PMC'}.`;
          
          const fingerprint = generateFingerprint(title, authors);
          
          // 1. Create Pending Item
          const item = await prisma.extractionItem.create({
            data: {
              jobId: job.id,
              rawData: result,
              status: "Pending"
            }
          });
          
          // 2. Deduplication check
          const existing = await prisma.content.findUnique({ where: { fingerprint } });
          
          if (existing) {
            await prisma.extractionItem.update({
              where: { id: item.id },
              data: { fingerprint, status: "Duplicate" }
            });
            duplicates++;
            processed++;
            continue;
          }
          
          // 3. Direct Mapping (No AI bottleneck for mass scale)
          // Insert directly into the main Content table just like Bulk Import!
          const newContent = await prisma.content.create({
            data: {
              title,
              authors,
              description,
              domain: job.targetDomain,
              contentType: job.targetContentType,
              subjectArea: result.keywordList?.keyword?.[0] || job.targetDomain,
              fileUrl: urlInfo.url,
              tags: result.keywordList?.keyword || [],
              price: 0,
              accessType: "OpenAccess",
              status: "Published",
              publishingMode: "Auto-Extracted",
              fingerprint
            }
          });
          
          await prisma.extractionItem.update({
            where: { id: item.id },
            data: {
              fingerprint,
              title,
              authors,
              domain: job.targetDomain,
              contentType: job.targetContentType,
              fileUrl: urlInfo.url,
              contentId: newContent.id,
              status: "Inserted"
            }
          });
          
          processed++;
          
          // Update job stats periodically
          if (processed % 10 === 0) {
            await prisma.extractionJob.update({
              where: { id: job.id },
              data: { totalProcessed: processed, totalDuplicates: duplicates, totalFailed: failed, totalInserted: processed - duplicates - failed }
            });
          }
        } catch (e) {
          failed++;
          processed++;
        }
      }
    }
  } catch (err) {
    console.error("Mass Extraction Error:", err);
    failed++;
  }
  
  // Final update
  await prisma.extractionJob.update({
    where: { id: job.id },
    data: { 
      status: "Completed",
      completedAt: new Date(),
      totalProcessed: processed,
      totalDuplicates: duplicates,
      totalFailed: failed,
      totalInserted: processed - duplicates - failed
    }
  });
}
