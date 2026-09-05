#!/usr/bin/env node
/**
 * Bring the old activity rows into the event log.
 *
 *   node scripts/migrate-events.cjs            # report only, writes nothing
 *   node scripts/migrate-events.cjs --apply    # write them
 *
 * Two sources, both imperfect, both worth keeping:
 *
 *   ReadEvent        append-only and honest about when, but roughly half of it
 *                    is the same read logged twice within a couple of seconds.
 *                    Those pairs collapse into one on the way in.
 *
 *   StudentActivity  written update-in-place, so its timestamp is the *last*
 *                    time an item was opened, not each time. One event per row
 *                    is the most that can honestly be recovered from it, and it
 *                    is marked as imported so nobody later mistakes it for a
 *                    full history.
 *
 * Neither source table is modified. Running twice is safe: every row carries a
 * dedupeKey derived from its source id.
 */

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const DUP_WINDOW_MS = 2000;

(async () => {
  console.log(APPLY ? 'Applying.\n' : 'Report only — nothing will be written. Add --apply to write.\n');

  // ── who belongs to which institution, resolved once ────────────────────────
  const users = await p.user.findMany({ select: { id: true, institutionId: true, role: true } });
  const inst = new Map(users.map(u => [u.id, u.institutionId]));
  const role = new Map(users.map(u => [u.id, u.role]));

  // ── ReadEvent → view, duplicates collapsed ────────────────────────────────
  const reads = await p.readEvent.findMany({ orderBy: { at: 'asc' } });
  const fromReads = [];
  let collapsed = 0;
  for (const r of reads) {
    const prev = fromReads[fromReads.length - 1];
    if (prev && prev.itemId === r.itemId && prev.userId === r.userId &&
        r.at - prev.at < DUP_WINDOW_MS) { collapsed++; continue; }
    fromReads.push({
      at: r.at, kind: 'view', userId: r.userId,
      institutionId: r.userId ? inst.get(r.userId) ?? null : null,
      role: r.userId ? role.get(r.userId) ?? null : null,
      itemType: r.itemType, itemId: r.itemId,
      dedupeKey: `import|readevent|${r.id}`,
    });
  }

  // ── StudentActivity → one view each, at its last-accessed time ────────────
  const acts = await p.studentActivity.findMany({
    where: { contentId: { not: null } },
    orderBy: { accessedAt: 'asc' },
  });
  const contents = await p.content.findMany({ select: { id: true, domain: true } });
  const domainOf = new Map(contents.map(c => [c.id, c.domain]));

  const fromActs = acts.map(a => ({
    at: a.accessedAt, kind: 'view', userId: a.userId,
    institutionId: a.userId ? inst.get(a.userId) ?? null : null,
    role: a.userId ? role.get(a.userId) ?? null : null,
    itemType: 'content', itemId: a.contentId,
    domain: domainOf.get(a.contentId) ?? null,
    durationMs: a.timeSpent > 0 ? a.timeSpent * 1000 : null,
    dedupeKey: `import|activity|${a.id}`,
  }));

  const rows = [...fromReads, ...fromActs];

  // ── what this would do ────────────────────────────────────────────────────
  console.log('ReadEvent rows              :', reads.length);
  console.log('  duplicates collapsed      :', collapsed, `(${Math.round(collapsed / (reads.length || 1) * 100)}%)`);
  console.log('  events recovered          :', fromReads.length);
  console.log('StudentActivity rows        :', acts.length);
  console.log('  events recovered          :', fromActs.length, '(one each — the table keeps no history)');
  console.log('');
  console.log('total events to write       :', rows.length);
  console.log('  with an institution       :', rows.filter(r => r.institutionId).length);
  console.log('  with a duration           :', rows.filter(r => r.durationMs).length);
  const dates = rows.map(r => r.at).sort((a, b) => a - b);
  if (dates.length) {
    console.log('  date range                :', dates[0].toISOString().slice(0, 10), '->', dates[dates.length - 1].toISOString().slice(0, 10));
  }
  console.log('already in LibraryEvent     :', await p.libraryEvent.count());

  if (!APPLY) {
    console.log('\nNothing written. Re-run with --apply to write these.');
    await p.$disconnect();
    return;
  }

  let written = 0, skipped = 0;
  for (const r of rows) {
    try { await p.libraryEvent.create({ data: r }); written++; }
    catch (e) { if (e.code === 'P2002') skipped++; else throw e; }
  }
  console.log(`\nWritten ${written}, already present ${skipped}.`);
  console.log('LibraryEvent now holds      :', await p.libraryEvent.count());
  await p.$disconnect();
})().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
