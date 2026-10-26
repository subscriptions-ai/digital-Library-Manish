import type { Judged } from './types.js';

/**
 * What a dry run keeps on the job row: a handful of examples and reasons, never a result set. The row stays small however large the source is.
 *   - at most SAMPLE_CAP sample records (at most PER_OUTCOME of any one outcome, so the examples are not all the same kind)
 *   - at most ISSUE_CAP reasons (conflicts, refusals, failures), at most PER_ISSUE_KIND of any one kind, so a flood of one kind never hides the others
 *   - every text clipped, and the whole thing under MAX_BYTES (samples are dropped from the end first, and `truncated` says so)
 * The totals ("would publish 80") are not here: they are the job's own counters.
 */
export const SAMPLE_CAP = 25, ISSUE_CAP = 25, PER_OUTCOME = 6, PER_ISSUE_KIND = 8, MAX_BYTES = 64 * 1024;

export type PreviewSample = { id: string; title: string | null; outcome: string; dup?: string; reason?: string };
export type PreviewIssue = { id: string; kind: 'conflict' | 'refused' | 'failed'; reason: string };
export type Preview = { v: 1; samples: PreviewSample[]; issues: PreviewIssue[]; truncated: boolean; caps: { samples: number; issues: number; bytes: number } };

const clip = (v: unknown, n: number) => (v == null ? null : String(v).slice(0, n));
export const emptyPreview = (): Preview => ({ v: 1, samples: [], issues: [], truncated: false, caps: { samples: SAMPLE_CAP, issues: ISSUE_CAP, bytes: MAX_BYTES } });

export function capPreview(p: Preview): Preview {
  const out: Preview = { ...emptyPreview(), samples: p.samples.slice(0, SAMPLE_CAP).map(s => ({ ...s, id: String(s.id).slice(0, 120), title: clip(s.title, 160), reason: clip(s.reason, 200) ?? undefined })), issues: p.issues.slice(0, ISSUE_CAP).map(i => ({ ...i, id: String(i.id).slice(0, 120), reason: String(i.reason).slice(0, 200) })), truncated: p.truncated };
  while (Buffer.byteLength(JSON.stringify(out)) > MAX_BYTES && (out.samples.length || out.issues.length)) { out.truncated = true; out.samples.length ? out.samples.pop() : out.issues.pop(); }
  return out;
}

/** Fold one chunk's judged records into the preview, within the caps. */
export function addToPreview(p: Preview | null | undefined, judged: Judged[], failed: { id: string; reason: string }[], title: (j: Judged) => string | null): Preview {
  const cur: Preview = p && (p as any).v === 1 ? { ...p, samples: [...p.samples], issues: [...p.issues] } : emptyPreview();
  const per = new Map<string, number>(); for (const s of cur.samples) per.set(s.outcome, (per.get(s.outcome) ?? 0) + 1);
  for (const j of judged) {
    const key = j.outcome === 'duplicate' ? `duplicate:${j.dup ?? 'unchanged'}` : j.outcome;
    if (cur.samples.length < SAMPLE_CAP && (per.get(key) ?? 0) < PER_OUTCOME) {
      cur.samples.push({ id: j.id, title: title(j), outcome: j.outcome, ...(j.dup ? { dup: j.dup } : {}), ...(j.reason ? { reason: j.reason } : {}) });
      per.set(key, (per.get(key) ?? 0) + 1);
    } else if (cur.samples.length >= SAMPLE_CAP) cur.truncated = true;
    const kind = j.dup === 'conflicting' ? 'conflict' : j.outcome === 'refused' ? 'refused' : null;
    if (kind) { if (cur.issues.length < ISSUE_CAP && cur.issues.filter(i => i.kind === kind).length < PER_ISSUE_KIND) cur.issues.push({ id: j.id, kind, reason: j.reason || (kind === 'conflict' ? 'licence or DOI disagrees with the held record' : 'refused by a rule') }); else cur.truncated = true; }
  }
  for (const f of failed) { if (cur.issues.length < ISSUE_CAP && cur.issues.filter(i => i.kind === 'failed').length < PER_ISSUE_KIND) cur.issues.push({ id: f.id, kind: 'failed', reason: f.reason }); else cur.truncated = true; }
  return capPreview(cur);
}
