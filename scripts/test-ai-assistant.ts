/**
 * Mock-Gemini end-to-end test for the AI Assistant service.
 *
 * Points the GoogleGenAI SDK at a local HTTP server that scripts
 * Gemini API responses, so the tool loop — the model asks for a
 * tool, the service runs it server-side, the result goes back as a
 * functionResponse, the model answers — is verified deterministically,
 * with no live key and no external network.
 *
 * Run: npx tsx scripts/test-ai-assistant.ts
 */
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import assert from 'node:assert';
import { setDefaultBaseUrls } from '@google/genai';
import type { PrismaClient } from '@prisma/client';

// The service builds its client at import time, so the mock base
// URL and a dummy key must be in place before it loads.
process.env.GEMINI_API_KEY = 'mock-test-key';

/** Every request body the mock received, for assertions. */
const requests: any[] = [];
/** Scripted responses, consumed in order. */
const script: any[] = [];

const mock: Server = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    console.log(`[mock] ${req.method} ${req.url}`);
    requests.push(JSON.parse(body));
    const reply = script.shift() ?? textResponse('unexpected extra call');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(reply));
  });
});

function functionCallResponse(name: string, args: Record<string, unknown>) {
  return {
    candidates: [{
      content: { role: 'model', parts: [{ functionCall: { name, args } }] },
      finishReason: 'STOP',
    }],
  };
}

function textResponse(text: string) {
  return {
    candidates: [{
      content: { role: 'model', parts: [{ text }] },
      finishReason: 'STOP',
    }],
  };
}

/** The functionResponse payload the service sent for the last round. */
function lastFunctionResponse(requestIndex: number, toolName: string) {
  const content = requests[requestIndex].contents;
  for (const msg of content) {
    for (const part of msg.parts ?? []) {
      if (part.functionResponse?.name === toolName) {
        return part.functionResponse.response.output;
      }
    }
  }
  throw new Error(`no functionResponse for ${toolName} in request ${requestIndex}`);
}

async function main() {
  await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', resolve));
  const port = (mock.address() as { port: number }).port;
  setDefaultBaseUrls({ geminiUrl: `http://127.0.0.1:${port}/v1beta` });

  const { generateAssistantResponse, maskPII } = await import('../src/server/aiAssistantService.js');
  const { PrismaClient } = await import('@prisma/client');
  const { contentTypeCounts } = await import('../src/lib/publicCounts.js');
  const prisma = new PrismaClient();

  // ── 1. PII masking ────────────────────────────────────────────
  assert.equal(maskPII('email me at ravi.kumar@example.com'), 'email me at [EMAIL]');
  assert.equal(maskPII('call +91-98765-43210 now'), 'call +91-[PHONE] now');
  assert.equal(maskPII('also try 98765 43210'), 'also try [PHONE]');
  assert.equal(maskPII('in 2022 we grew'), 'in 2022 we grew', 'years are not phone numbers');

  // ── 2. Two tool rounds, then a final answer ───────────────────
  const userMessage = 'Reach me at priya@example.com, +91-98765-43210. Overview and solo pricing for 6 departments?';
  script.push(
    functionCallResponse('get_library_overview', {}),
    functionCallResponse('get_subscription_pricing', { plan: 'solo', departments: 6 }),
    textResponse('Mock final answer built from the tool results.'),
  );

  const result = await generateAssistantResponse(
    [{ role: 'user', content: 'earlier question' }],
    userMessage,
    { prisma, pricingVisible: true },
  );

  assert.equal(result.text, 'Mock final answer built from the tool results.');
  assert.equal(requests.length, 3, 'one call per round plus the initial call');

  // The user message reached the model with PII already masked.
  const sentText = JSON.stringify(requests[0].contents.at(-1));
  assert.ok(sentText.includes('[EMAIL]'), 'email masked before reaching the model');
  assert.ok(sentText.includes('[PHONE]'), 'phone masked before reaching the model');
  assert.ok(!sentText.includes('priya@example.com'));
  assert.ok(!sentText.includes('98765'));

  // The model was given the system instruction and every tool.
  // (The SDK flattens the config into the request body.)
  const firstConfig = requests[0];
  assert.ok(JSON.stringify(firstConfig.systemInstruction).includes('STM Digital Library AI Assistant'));
  assert.equal(firstConfig.generationConfig.temperature, 0.3);
  const declaredTools: string[] = firstConfig.tools[0].functionDeclarations.map((d: any) => d.name);
  assert.deepEqual(declaredTools, [
    'get_subscription_pricing',
    'search_catalogue',
    'get_library_overview',
    'get_company_info',
  ]);

  // Round 1: the overview tool ran server-side against the real DB.
  const overview = lastFunctionResponse(1, 'get_library_overview');
  const expectedCounts = await contentTypeCounts(prisma);
  assert.deepEqual(overview.counts, expectedCounts, 'overview tool returns live counts');
  assert.ok(Array.isArray(overview.departments) && overview.departments.length > 0);

  // Round 2: the pricing tool computed the real solo rate card.
  const pricing = lastFunctionResponse(2, 'get_subscription_pricing');
  assert.equal(pricing.soloLearner.ratePerDepartmentYearINR, 3990, 'bulk rate from 5 departments');
  assert.equal(pricing.soloLearner.subtotalINR, 23940);
  assert.equal(pricing.soloLearner.gstINR, 4309.2);
  assert.equal(pricing.soloLearner.totalINR, 28249.2);
  assert.equal(pricing.soloLearner.bulkApplied, true);
  assert.equal(pricing.institutional, undefined, 'solo-only request does not leak the institutional card');

  // ── 3. A tool the model invents gets a plain error, not a crash ──
  script.push(
    functionCallResponse('get_secret_data', {}),
    textResponse('I cannot do that.'),
  );
  const unknown = await generateAssistantResponse([], 'give me secrets', { prisma, pricingVisible: true });
  assert.equal(unknown.text, 'I cannot do that.');
  assert.ok(JSON.stringify(lastFunctionResponse(4, 'get_secret_data')).includes('Unknown tool'));

  // ── 4. Hidden pricing is refused by the tool, not guessed ──────
  script.push(
    functionCallResponse('get_subscription_pricing', { plan: 'institutional' }),
    textResponse('Please contact us for a quotation.'),
  );
  await generateAssistantResponse([], 'institutional price?', { prisma, pricingVisible: false });
  assert.ok(
    JSON.stringify(lastFunctionResponse(6, 'get_subscription_pricing')).includes('Pricing is not published'),
    'hidden pricing returns the contact-us message',
  );

  // ── 5. A model that never stops calling tools is bounded ───────
  script.push(
    functionCallResponse('search_catalogue', { query: 'a' }),
    functionCallResponse('search_catalogue', { query: 'b' }),
    functionCallResponse('search_catalogue', { query: 'c' }),
    functionCallResponse('search_catalogue', { query: 'd' }),
  );
  const bounded = await generateAssistantResponse([], 'search forever', { prisma, pricingVisible: true });
  assert.equal(requests.length, 11, 'loop stopped after MAX_TOOL_ROUNDS, not forever');
  assert.equal(bounded.text, "I'm sorry, I couldn't generate a response.");

  await prisma.$disconnect();
  mock.close();
  console.log('AI Assistant mock tests passed');
}

main().catch((err) => {
  console.error(err);
  mock.close();
  process.exit(1);
});
