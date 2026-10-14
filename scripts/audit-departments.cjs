/**
 * READ-ONLY audit of every department value the database holds, and what the canonical registry makes of it.
 *
 *   node scripts/audit-departments.cjs            # against DATABASE_URL (locally .env, or Coolify's environment)
 *
 * Writes nothing: it only reads, inside one READ ONLY transaction, so Postgres itself would refuse a write. Prints the
 * database it measured (host, port, name — never the password), then one line per distinct value with where it is used,
 * and a summary: aliases to fold, unresolved values, plan-name strings that are not departments, and public slugs.
 */
const { PrismaClient } = require('@prisma/client');

const COLUMNS = [ // [label, table, column]
  ['Journal', 'Journal', 'domain'], ['Article', 'Article', 'domain'], ['Book', 'Book', 'domain'], ['Content', 'Content', 'domain'],
  ['ContentModule', 'ContentModule', 'domain'], ['ExtractionItem', 'ExtractionItem', 'domain'],
  ['Subscription.domainName', 'Subscription', 'domainName'], ['Quotation.allowedDomain', 'Quotation', 'allowedDomain'],
  ['Receipt.allowedDomain', 'Receipt', 'allowedDomain'], ['DemoRequest', 'DemoRequest', 'department'],
];
const JSON_COLUMNS = [ // JSON arrays of names
  ['Subscription.domains', 'Subscription', 'domains'], ['Bundle.domains', 'Bundle', 'domains'], ['User.interestedDomains', 'User', 'interestedDomains'],
  ['BlogPost.domains', 'BlogPost', 'domains'], ['ContactInquiry.departments', 'ContactInquiry', 'departments'],
];

// The registry is TypeScript; load it through tsx when available, otherwise the compiled copy is not needed here.
function loadRegistry() {
  try { require('tsx/cjs'); } catch { /* falls through to the error below */ }
  return require('../src/lib/departmentRegistry.ts');
}

(async () => {
  if (!process.env.DATABASE_URL) { try { require('dotenv').config({ quiet: true }); } catch {} }
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(2); }
  const reg = loadRegistry();
  const u = new URL(process.env.DATABASE_URL);
  console.log(`Database: ${u.hostname}:${u.port || 5432}/${u.pathname.slice(1)}  (read-only)\n`);
  const p = new PrismaClient();
  const found = new Map(); // value -> { source: count }
  const add = (src, v, n) => { if (v == null) return; const k = String(v); const o = found.get(k) || {}; o[src] = (o[src] || 0) + n; found.set(k, o); };
  await p.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    for (const [label, table, col] of COLUMNS) {
      try { for (const r of await tx.$queryRawUnsafe(`select "${col}" v, count(*)::int n from "${table}" group by 1`)) add(label, r.v, r.n); }
      catch (e) { console.log(`(skipped ${label}: ${String(e.message).split('\n').pop()})`); }
    }
    for (const [label, table, col] of JSON_COLUMNS) {
      try { for (const r of await tx.$queryRawUnsafe(`select e v, count(*)::int n from "${table}", jsonb_array_elements_text(case when jsonb_typeof("${col}"::jsonb)='array' then "${col}"::jsonb else '[]'::jsonb end) e group by 1`)) add(label, r.v, r.n); }
      catch (e) { console.log(`(skipped ${label}: ${String(e.message).split('\n').pop()})`); }
    }
    // Quotations keep their department list inside the saved inputs, and comma-joined in allowedDomain.
    for (const r of await tx.$queryRawUnsafe(`select d v, count(*)::int n from "Quotation", jsonb_array_elements_text(coalesce("pricingBreakdown"->'doc'->'departments','[]'::jsonb)) d group by 1`)) add('Quotation.doc.departments', r.v, r.n);
  }, { timeout: 120000 });

  const rows = [...found.entries()].map(([value, uses]) => {
    const r = reg.resolveCanonicalDepartment(value);
    return { value, uses, status: r.status, name: r.name, slug: reg.departmentSlug(value), total: Object.values(uses).reduce((a, b) => a + b, 0) };
  }).sort((a, b) => a.value.toLowerCase().localeCompare(b.value.toLowerCase()));

  for (const r of rows) {
    const tag = r.status === 'unresolved' ? (r.value.includes(',') ? 'list of departments' : 'UNRESOLVED')
      : r.status === 'alias' ? `ALIAS -> ${r.name}` : r.value === r.name ? 'canonical' : `case/spacing -> ${r.name}`;
    console.log(`${JSON.stringify(r.value).padEnd(46)} [${tag}]  slug=${r.slug}\n    ${Object.entries(r.uses).map(([s, n]) => `${s}=${n}`).join('  ')}`);
  }
  const commaJoined = rows.filter((r) => r.status === 'unresolved' && r.value.includes(','));
  const unresolved = rows.filter((r) => r.status === 'unresolved' && !r.value.includes(','));
  const folds = rows.filter((r) => r.status === 'alias' || (r.status === 'canonical' && r.value !== r.name));
  console.log(`\n== Summary ==\ndistinct values: ${rows.length}\ncanonical (exact official name): ${rows.filter((r) => r.status === 'canonical' && r.value === r.name).length} of ${reg.CANONICAL_NAMES.length} official departments`);
  console.log(`official departments with no records anywhere: ${reg.CANONICAL_NAMES.filter((n) => !found.has(n)).join(', ') || '(none)'}`);
  console.log(`\nspellings that fold into an official name (${folds.length}):`); for (const r of folds) console.log(`  ${JSON.stringify(r.value)} -> ${r.name}   (${r.total} uses)`);
  console.log(`\ncomma-joined lists (quotation/receipt allowedDomain; each part is checked separately below): ${commaJoined.length}`);
  for (const r of commaJoined) { const parts = r.value.split(',').map((s) => s.trim()); console.log(`  ${JSON.stringify(r.value)} -> unresolved parts: ${parts.filter((x) => reg.resolveCanonicalDepartment(x).status === 'unresolved').join(' | ') || '(none)'}`); }
  console.log(`\nUNRESOLVED values — need a person's decision (${unresolved.length}):`); for (const r of unresolved) console.log(`  ${JSON.stringify(r.value)}  ${Object.entries(r.uses).map(([s, n]) => `${s}=${n}`).join(' ')}`);
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
