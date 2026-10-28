import { normaliseIssn } from '../ingestionWorker.js';
import { canonicalDepartmentName } from '../departmentRegistry.js';
import { journalDepartment } from './journalDepartment.js';
import { classifyJournal } from './journalClassification.js';
import { auditTitleMapping } from './journalMappingAudit.js';
import type { JournalCandidate } from './journalSources.js';

/**
 * Planning a controlled import of NEW journals from Crossref (and OpenAlex, when it has a key): which candidates are genuinely new, which are duplicates, which are
 * identity conflicts, which have no department, and which are ready to insert. Pure: it reads a snapshot of the journals we hold and writes nothing.
 *
 * What may be inserted, and nothing else:
 *   · a real identifier (a valid ISSN, and/or e-ISSN) that NO held journal carries in either column (ISSN↔ISSN, ISSN↔e-ISSN, e-ISSN↔ISSN, e-ISSN↔e-ISSN, or an ISSN-L);
 *   · a title that is not a held journal's title. The same title under other identifiers is an IDENTITY CONFLICT: it is reported and held for a person, never merged and never
 *     inserted, unless a recorded decision says "Accept as distinct";
 *   · a publisher, and a department that comes from the existing mapping (journalDepartment: the engine's own insert-time rule) and that the journal classifier does not contradict.
 *     No department, or two disagreeing, is review, never a guess.
 * Every journal this produces is MetadataOnly, open access NOT verified, no licence, never Accepted. The writer (scripts/journal-source-apply.cjs) re-checks every
 * identifier and title against the live table before each insert and skips a candidate that someone else took meanwhile.
 */

export type Held = { id: string; title: string; issn: string | null; eissn: string | null; status: string; publisher?: string | null };
export type Decision = { issn: string; decision: 'distinct' | 'blocked' | 'hold' };

export type Outcome = 'ready' | 'duplicate' | 'conflict' | 'no_department' | 'no_publisher' | 'malformed' | 'outside_target' | 'classifier_disagrees' | 'duplicate_in_batch' | 'weak_mapping';

/** A source-specific department decision (OpenAlex: from the journal's topics). `confidence` must be 'high' for a journal to be inserted; anything less is review. */
export type DeptDecision = { dept: string | null; confidence: 'high' | 'low'; reason?: string; evidence?: Record<string, any> };

/** ISSN check digit (ISO 3297): eight characters, the last a weighted mod-11 check. */
export function validIssn(v: string | null | undefined): boolean {
  const s = String(v ?? '').toUpperCase(); if (!/^\d{4}-\d{3}[\dX]$/.test(s)) return false;
  const d = s.replace('-', ''); let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(d[i]) * (8 - i);
  const check = (11 - (sum % 11)) % 11;
  return d[7] === (check === 10 ? 'X' : String(check));
}

export const normTitle = (t: unknown) => String(t ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export type HeldIndex = { byIdentifier: Map<string, Held>; byTitle: Map<string, Held[]>; };
export function buildIndex(held: Held[]): HeldIndex {
  const byIdentifier = new Map<string, Held>(), byTitle = new Map<string, Held[]>();
  for (const h of held) {
    for (const k of [h.issn, h.eissn]) if (k) { const n = normaliseIssn(k) || k; if (!byIdentifier.has(n)) byIdentifier.set(n, h); }
    const t = normTitle(h.title); if (t) (byTitle.get(t) || byTitle.set(t, []).get(t)!).push(h);
  }
  return { byIdentifier, byTitle };
}

export type Planned = {
  outcome: Outcome; candidate: JournalCandidate; department: string | null;
  /** What the outcome rests on: the held journal matched and by which identifier, the conflicting title, the classifier's view. */
  detail: string; matched?: { id: string; status: string; via: string };
  evidence?: { mapping: string | null; classifier: { dept: string | null; tier: string; families: string[] } };
};

export type Plan = {
  source: string; checked: number; ready: Planned[]; counts: Record<Outcome, number>;
  byDepartment: Record<string, Record<Outcome, number>>; samples: Partial<Record<Outcome, Planned[]>>;
  /** Every row of the outcomes asked for with `keep` (for a review list). */
  kept: Partial<Record<Outcome, Planned[]>>;
};
const blank = (): Record<Outcome, number> => ({ ready: 0, duplicate: 0, conflict: 0, no_department: 0, no_publisher: 0, malformed: 0, outside_target: 0, classifier_disagrees: 0, duplicate_in_batch: 0, weak_mapping: 0 });
const SAMPLE = 8;

/**
 * `targets`: only these departments are inserted; a candidate mapped elsewhere is `outside_target` (reported, not inserted).
 * `decisions`: recorded "distinct" decisions by ISSN, the one thing that lets a same-title journal through.
 */
export function planCandidates(source: string, cands: JournalCandidate[], held: Held[], opts: { targets?: string[]; decisions?: Decision[]; skippedAtFetch?: number; deptOf?: (c: JournalCandidate) => DeptDecision; keep?: Outcome[] } = {}): Plan {
  const idx = buildIndex(held);
  const distinct = new Set((opts.decisions || []).filter(d => d.decision === 'distinct').map(d => d.issn));
  const plan: Plan = { source, checked: cands.length + (opts.skippedAtFetch || 0), ready: [], counts: blank(), byDepartment: {}, samples: {}, kept: {} };
  plan.counts.malformed += opts.skippedAtFetch || 0;                              // dropped at the source for having no title or no usable ISSN
  const batchIds = new Map<string, JournalCandidate>(), batchTitles = new Map<string, JournalCandidate>();

  const put = (outcome: Outcome, c: JournalCandidate, department: string | null, detail: string, extra: Partial<Planned> = {}) => {
    const p: Planned = { outcome, candidate: c, department, detail, ...extra };
    plan.counts[outcome]++;
    (plan.byDepartment[department || '(none)'] ||= blank())[outcome]++;
    const s = (plan.samples[outcome] ||= []); if (s.length < SAMPLE) s.push(p);
    if (outcome === 'ready') plan.ready.push(p);
    if (opts.keep?.includes(outcome)) (plan.kept[outcome] ||= []).push(p);
  };

  for (const c of cands) {
    const issn = normaliseIssn(c.issn), eissn = normaliseIssn(c.eissn), issnL = normaliseIssn(c.issnL);
    const ids = [issn, eissn, issnL].filter(Boolean) as string[];
    // Malformed: no usable identifier, or one that fails the ISSN check digit.
    if (!String(c.title || '').trim() || !issn || ids.some(i => !validIssn(i))) { put('malformed', c, null, !issn ? 'no usable ISSN' : 'an identifier fails the ISSN check digit'); continue; }
    // The department: from the source's own evidence when it gives some (OpenAlex topics, `deptOf`), otherwise from the title by the existing mapping, whose title-only matches are then
    // audited (journalMappingAudit.ts): a generic word, a non-English title matched on a short word, or another field's term is review, never a guess.
    let decision: DeptDecision;
    if (opts.deptOf) decision = opts.deptOf(c);
    else {
      const m = canonicalDepartmentName(journalDepartment(c.title, c.subjects));
      if (m && !c.subjects.length) { const a = auditTitleMapping(c.title, c.publisherName, m); decision = a.verdict === 'good' ? { dept: m, confidence: 'high', evidence: { basis: 'title', audit: a.verdict } } : { dept: m, confidence: 'low', reason: `title-only match is ${a.verdict}: ${a.reasons[0]}${a.betterDepartment ? ` (the title points to ${a.betterDepartment})` : ''}` }; }
      else decision = { dept: m, confidence: 'high', evidence: { basis: m ? 'title+subjects' : 'none' } };
    }
    const mapping = decision.dept;
    // 1–5. Any identifier we already hold, in either column: the same journal, whatever its title or status.
    const hit = ids.map(i => ({ i, h: idx.byIdentifier.get(i) })).find(x => x.h);
    if (hit) { put('duplicate', c, mapping, `identifier ${hit.i} is already held`, { matched: { id: hit.h!.id, status: hit.h!.status, via: hit.h!.issn === hit.i ? 'issn' : 'eissn' } }); continue; }
    // The same journal twice in this batch, under any identifier.
    const twin = ids.map(i => batchIds.get(i)).find(Boolean);
    if (twin) { put('duplicate_in_batch', c, mapping, `already in this batch (${twin.issn})`); continue; }
    // Same title under other identifiers: an identity conflict, held for a person.
    const t = normTitle(c.title);
    const sameTitle = idx.byTitle.get(t);
    if ((sameTitle?.length || batchTitles.has(t)) && !distinct.has(issn)) {
      put('conflict', c, mapping, sameTitle?.length ? `same title as held journal ${sameTitle[0].issn || sameTitle[0].eissn} (${sameTitle[0].status})` : `same title as another candidate in this batch`, sameTitle?.length ? { matched: { id: sameTitle[0].id, status: sameTitle[0].status, via: 'title' } } : {});
      continue;
    }
    if (!mapping) { put('no_department', c, null, 'the title and subjects do not name a department'); continue; }
    if (opts.targets && !opts.targets.includes(mapping)) { put('outside_target', c, mapping, `${mapping} is not a target department`); continue; }
    if (decision.confidence !== 'high') { put('weak_mapping', c, mapping, decision.reason || 'the department evidence is not strong enough', { evidence: { mapping, ...(decision.evidence || {}), classifier: { dept: null, tier: 'n/a', families: [] } } as any }); continue; }
    if (!String(c.publisherName || '').trim()) { put('no_publisher', c, mapping, 'no publisher recorded'); continue; }
    // The journal classifier (title and subjects, independent families) must not contradict the mapping.
    const cl = classifyJournal({ title: c.title, subjects: c.subjects });   // the journal classifier reads the same title and subjects
    const evidence = { mapping, ...(decision.evidence || {}), classifier: { dept: cl.dept, tier: cl.tier, families: cl.families as string[] } };
    if (cl.dept && cl.dept !== mapping && cl.tier !== 'low' && cl.tier !== 'unclassifiable') { put('classifier_disagrees', c, mapping, `the classifier says ${cl.dept} (${cl.tier})`, { evidence }); continue; }
    for (const i of ids) batchIds.set(i, c); batchTitles.set(t, c);
    put('ready', c, mapping, `new; ${mapping}`, { evidence });
  }
  return plan;
}
