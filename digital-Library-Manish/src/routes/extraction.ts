import { PrismaClient } from '@prisma/client';
import { generateFingerprint } from '../lib/dedup.js';
import { classifyContent } from '../lib/aiClassifier.js';
import { validateContentUrl } from '../lib/pdfValidator.js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { evaluateArticlesWithAI } from '../lib/aiAgent.js';

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
      
      // Start Extraction in background
      if (job.sourceType === 'AutomatedMassScraper') {
        runMassExtraction(job).catch(console.error);
        return res.json({ success: true, message: `Extraction started for ${job.targetDomain}.` });
      } else if (job.sourceType === 'OJS') {
        runOjsExtraction(job).catch(console.error);
        return res.json({ success: true, message: `OJS Extraction started for ${job.targetDomain}.` });
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
  let totalInserted = 0;
  
  const query = `${job.targetDomain} ${job.targetContentType}`.trim();
  
  try {
    // 1. Fetch from OpenAlex (Massive global aggregator for all domains)
    // We will fetch up to 3 pages (150 items) for this run to keep it fast but broad.
    let allFetchedArticles: any[] = [];
    
    for (let page = 1; page <= 3; page++) {
      const fetchRes = await fetch(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=has_pdf_url:true&per-page=50&page=${page}`);
      const data = await fetchRes.json();
      if (data && data.results && data.results.length > 0) {
        allFetchedArticles = allFetchedArticles.concat(data.results);
      } else {
        break; // no more results
      }
    }
    
    console.log(`OpenAlex found ${allFetchedArticles.length} OA articles for ${query}.`);

    // Process in batches of 50 for the AI Agent
    const BATCH_SIZE = 50;
    for (let i = 0; i < allFetchedArticles.length; i += BATCH_SIZE) {
      const batch = allFetchedArticles.slice(i, i + BATCH_SIZE);
      
      // Transform to common format
      const articlesFormat = batch.map(a => ({
        _raw: a,
        title: a.title || "Untitled",
        abstract: a.concepts ? "Keywords: " + a.concepts.map((c: any) => c.display_name).join(", ") : "No abstract",
        authors: a.authorships?.map((au: any) => au.author?.display_name).join(", ") || "Unknown",
        pdfUrl: a.best_oa_location?.pdf_url || a.open_access?.oa_url,
        keywords: a.concepts?.map((c: any) => c.display_name) || []
      })).filter(a => a.pdfUrl); // Must have PDF

      if (articlesFormat.length === 0) continue;

      // 2. AI Engine Curation! Let the AI decide which ones are actually relevant.
      console.log(`Sending ${articlesFormat.length} items to AI Engine for curation...`);
      const curatedArticles = await evaluateArticlesWithAI(job.targetDomain, articlesFormat);
      console.log(`AI Engine approved ${curatedArticles.length} items.`);

      for (const result of curatedArticles) {
        try {
          if (!result.pdfUrl) {
            failed++; processed++; continue;
          }

          const fingerprint = generateFingerprint(result.title, result.authors);
          
          // 1. Create Pending Item
          const item = await prisma.extractionItem.create({
            data: {
              jobId: job.id,
              rawData: result._raw,
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
          
          // 3. Direct Mapping
          const newContent = await prisma.content.create({
            data: {
              title: result.title,
              authors: result.authors,
              description: `Auto-extracted OA content from OpenAlex.`,
              domain: job.targetDomain,
              contentType: job.targetContentType,
              subjectArea: result.keywords[0] || job.targetDomain,
              fileUrl: result.pdfUrl,
              tags: result.keywords.slice(0, 5),
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
              title: result.title,
              authors: result.authors,
              domain: job.targetDomain,
              contentType: job.targetContentType,
              fileUrl: result.pdfUrl,
              contentId: newContent.id,
              status: "Inserted"
            }
          });
          
          totalInserted++;
          processed++;
          
        } catch (e) {
          console.error("Error inserting item:", e);
          failed++;
          processed++;
        }
      }
      
      // Update job stats after each AI batch
      await prisma.extractionJob.update({
        where: { id: job.id },
        data: { totalProcessed: processed, totalDuplicates: duplicates, totalFailed: failed, totalInserted: totalInserted }
      });
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
      totalInserted: totalInserted
    }
  });
}

async function runOjsExtraction(job: any) {
  let processed = 0;
  let duplicates = 0;
  let flagged = 0;
  let failed = 0;
  
  try {
    let baseUrl = job.sourceConfig?.ojsUrl || 'https://engineeringjournals.stmjournals.in';
    baseUrl = baseUrl.replace(/\/$/, ''); // remove trailing slash
    
    // 1. Authenticate with OJS using curl to ensure cookie persistence across redirects
    const cookieFile = path.join(process.cwd(), `ojs-cookies-${Date.now()}.txt`);
    try {
      execSync(`curl -s -c ${cookieFile} ${baseUrl}/index.php/index/login > /dev/null`);
      execSync(`curl -s -b ${cookieFile} -c ${cookieFile} -d 'username=enggstm&password=EEEcal@STM%231&source=' -L ${baseUrl}/index.php/index/login/signIn > /dev/null`);
      console.log("OJS Login Attempted via curl.");
    } catch (e) {
      console.error("OJS Login Error via curl:", e);
    }

    // Ensure extracted_pdfs directory exists
    const pdfDir = path.join(process.cwd(), 'public', 'extracted_pdfs');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }
    
    // OAI-PMH endpoint for OJS
    const oaiUrl = `${baseUrl}/index.php/index/oai?verb=ListRecords&metadataPrefix=oai_dc`;
    
    const fetchRes = await fetch(oaiUrl);
    const text = await fetchRes.text();
    
    // Parse records via Regex
    const records = text.match(/<record>[\s\S]*?<\/record>/g) || [];
    
    // Process a batch (e.g. up to 100)
    const maxRecords = Math.min(records.length, 100);
    
    for (let i = 0; i < maxRecords; i++) {
      const recordXml = records[i];
      if (recordXml.includes('status="deleted"')) continue;
      
      try {
        const titleMatch = recordXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/);
        const title = titleMatch ? titleMatch[1].trim() : "Untitled";
        
        const creators = [...recordXml.matchAll(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/g)].map(m => m[1].trim());
        const authors = creators.length > 0 ? creators.join(', ') : "Unknown";
        
        const descMatch = recordXml.match(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/);
        const description = descMatch ? descMatch[1].trim() : `OJS Extracted Content from ${baseUrl}`;
        
        // Find relation or identifier that looks like a PDF link
        const relationMatch = recordXml.match(/<dc:relation[^>]*>(https?:\/\/[^\s<]+?pdf[^\s<]*)<\/dc:relation>/i);
        let ojsPdfUrl = relationMatch ? relationMatch[1] : null;
        
        if (!ojsPdfUrl) {
          const idMatch = recordXml.match(/<dc:identifier[^>]*>(https?:\/\/[^\s<]+?pdf[^\s<]*)<\/dc:identifier>/i);
          if (idMatch) ojsPdfUrl = idMatch[1];
        }
        
        if (!ojsPdfUrl) {
          // If no direct PDF link, construct it from article view if possible
          const viewMatch = recordXml.match(/<dc:identifier[^>]*>(https?:\/\/[^\s<]+\/article\/view\/\d+)<\/dc:identifier>/i);
          if (viewMatch) {
            ojsPdfUrl = `${viewMatch[1]}/pdf`;
          } else {
            failed++; processed++; continue;
          }
        }
        
        // Convert /view/ links to /download/ links for direct PDF access
        if (ojsPdfUrl.includes('/article/view/')) {
          ojsPdfUrl = ojsPdfUrl.replace('/article/view/', '/article/download/');
        }

        const fingerprint = generateFingerprint(title, authors);
        
        // 1. Create Pending Item
        const item = await prisma.extractionItem.create({
          data: {
            jobId: job.id,
            rawData: { title, authors, sourceUrl: ojsPdfUrl, source: baseUrl },
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
        
        // 3. Download PDF locally via curl
        let localFileUrl = ojsPdfUrl;
        try {
          const filename = `ojs_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`;
          const filePath = path.join(pdfDir, filename);
          
          // Check headers first
          const headersStr = execSync(`curl -s -I -b ${cookieFile} -L ${ojsPdfUrl}`).toString();
          
          if (headersStr.toLowerCase().includes('application/pdf')) {
            execSync(`curl -s -b ${cookieFile} -L ${ojsPdfUrl} -o ${filePath}`);
            localFileUrl = `/extracted_pdfs/${filename}`;
          } else {
            console.log(`Warning: Downloaded content is not PDF for ${ojsPdfUrl}`);
            await prisma.extractionItem.update({
              where: { id: item.id },
              data: { fingerprint, status: "Failed", errorMessage: "Paywalled or login failed" }
            });
            failed++;
            processed++;
            continue;
          }
        } catch (downloadErr) {
          console.error("Download Error:", downloadErr);
          localFileUrl = ojsPdfUrl; // Fallback
        }

        // 4. Direct Mapping
        const newContent = await prisma.content.create({
          data: {
            title,
            authors,
            description,
            domain: job.targetDomain,
            contentType: job.targetContentType,
            subjectArea: job.targetDomain,
            fileUrl: localFileUrl,
            tags: [],
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
            fileUrl: localFileUrl,
            contentId: newContent.id,
            status: "Inserted"
          }
        });
        
        processed++;
        
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
  } catch (err) {
    console.error("OJS Extraction Error:", err);
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
