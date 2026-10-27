import { useCallback, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Badge, Button } from '../../ui';
import type { BadgeTone } from '../../ui';
import { api } from './api';
import { N } from './format';

/**
 * DOAJ Identity Conflicts.
 *
 * A DOAJ journal whose ISSN and e-ISSN we do not hold, but whose TITLE is a journal we hold under other ISSNs, has never been imported: a title is not an identity.
 * It might be a different journal that shares a name, or the same journal under other ISSNs. This lays the two records side by side with the evidence (publisher, country, web
 * address, continuity, ISSN numbers) and a verdict, and lets a person record a decision.
 *
 * A decision is a RECORD. Nothing here imports a journal, creates one, or changes one that is held.
 */

type Doaj = { title: string; issn: string; eissn: string | null; publisher: string | null; country: string | null; homepage: string | null; doajUrl: string | null; alternativeTitle: string | null };
type Held = { id: string; title: string; issn: string | null; eissn: string | null; status: string; publisher: string | null; country: string | null; homepage: string | null; department: string | null; origin: string };
type Verdict = 'distinct' | 'duplicate' | 'ambiguous';
type Decision = 'distinct' | 'blocked' | 'hold';
type Item = {
  doaj: Doaj; held: Held[]; verdict: Verdict; against: string; reasons: string[]; fingerprint: string;
  evidence: { samePublisher: boolean | null; sameCountry: boolean | null; sameHomepage: boolean | null; continuity: boolean; issnBlock: boolean };
  decision: null | { decision: Decision; by: string | null; at: string; note: string | null }; changedSinceDecision: boolean;
};
type Data = { asOf: string; summary: { total: number; distinct: number; duplicate: number; ambiguous: number }; decisions: { undecided: number; distinct: number; blocked: number; hold: number; lookAgain: number }; items: Item[] };

const VERDICT: Record<Verdict, { label: string; tone: BadgeTone }> = {
  distinct: { label: 'Likely distinct journal', tone: 'success' },
  duplicate: { label: 'Likely duplicate or renamed', tone: 'caution' },
  ambiguous: { label: 'Ambiguous', tone: 'neutral' },
};
const DECIDE: { id: Decision; label: string; hint: string }[] = [
  { id: 'distinct', label: 'Accept as distinct', hint: 'A different journal that shares a name. Recorded only: it is not imported.' },
  { id: 'blocked', label: 'Keep blocked', hint: 'It stays out, as it is today.' },
  { id: 'hold', label: 'Hold for review', hint: 'Not decided yet; marked so it is not forgotten.' },
];
const DECISION_LABEL: Record<Decision, string> = { distinct: 'Accepted as distinct', blocked: 'Kept blocked', hold: 'Held for review' };
const STATUS_TONE: Record<string, BadgeTone> = { Accepted: 'success', MetadataOnly: 'accent', NeedsReview: 'caution', Draft: 'caution', Rejected: 'alarm' };
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

const Yn = ({ label, v }: { label: string; v: boolean | null }) => (
  <span className="inline-flex items-center gap-1 text-[12px] text-ink-2"><span className="text-muted">{label}</span> <b>{v === null ? 'unknown' : v ? 'yes' : 'no'}</b></span>
);

function Link({ href, children }: { href: string | null; children: React.ReactNode }) {
  const u = safeUrl(href);
  return u ? <a href={u} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline underline-offset-2">{children}</a> : <span className="break-all">{children}</span>;
}

function Card({ item, onDecide, busy }: { item: Item; onDecide: (i: Item, d: Decision, note: string) => void; busy: boolean }) {
  const [note, setNote] = useState(item.decision?.note || '');
  const v = VERDICT[item.verdict];
  const d = item.doaj;
  return (
    <li className="rounded-xl border border-rule bg-surface p-3.5 sm:p-4" aria-label={`${d.title}, ${v.label}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={v.tone} className="max-w-full whitespace-normal">{v.label}</Badge>
        {item.decision && <Badge className="max-w-full whitespace-normal" tone={item.decision.decision === 'distinct' ? 'success' : item.decision.decision === 'hold' ? 'caution' : 'neutral'}>{DECISION_LABEL[item.decision.decision]}</Badge>}
        {item.changedSinceDecision && <Badge tone="alarm" className="max-w-full whitespace-normal">Evidence changed — look again</Badge>}
      </div>
      <h3 className="mt-2 break-words text-[15px] font-semibold text-ink">{d.title}</h3>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <section aria-label="In DOAJ" className="rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] text-ink-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">In DOAJ (not held)</p>
          <p className="mt-1">ISSN <span className="tabular-nums">{d.issn}</span> · e-ISSN <span className="tabular-nums">{d.eissn || '—'}</span></p>
          <p className="break-words">Publisher: {d.publisher || '—'}</p>
          <p>Country: {d.country || '—'}</p>
          <p>Website: <Link href={d.homepage}>{d.homepage || '—'}</Link></p>
          <p>DOAJ record: <Link href={d.doajUrl}>{d.doajUrl ? d.doajUrl.replace(/^https?:\/\//, '') : '—'}</Link></p>
          {d.alternativeTitle && <p className="break-words">Also called: {d.alternativeTitle}</p>}
        </section>
        <section aria-label="Already held" className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Already held with this title ({item.held.length})</p>
          {item.held.map(h => (
            <div key={h.id} className={`rounded-lg px-3 py-2.5 text-[12.5px] text-ink-2 ${h.id === item.against ? 'bg-accent-soft' : 'bg-surface-2'}`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={STATUS_TONE[h.status] || 'neutral'}>{h.status}</Badge>
                <Badge>{h.origin}</Badge>
                {h.id === item.against && item.held.length > 1 && <Badge tone="accent">Closest</Badge>}
              </div>
              <p className="mt-1">ISSN <span className="tabular-nums">{h.issn || '—'}</span> · e-ISSN <span className="tabular-nums">{h.eissn || '—'}</span></p>
              <p className="break-words">Publisher: {h.publisher || '—'}</p>
              <p>Country: {h.country || '—'}{h.department ? ` · ${h.department}` : ''}</p>
              <p>Website: <Link href={h.homepage}>{h.homepage || '—'}</Link></p>
            </div>
          ))}
        </section>
      </div>

      <div className="mt-3 text-[12.5px] text-ink-2">
        <p><b>Why:</b> {item.reasons.join('; ')}.</p>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
          <Yn label="Same publisher" v={item.evidence.samePublisher} /><Yn label="Same country" v={item.evidence.sameCountry} /><Yn label="Same web address" v={item.evidence.sameHomepage} />
          <Yn label="DOAJ says it continues a held journal" v={item.evidence.continuity} /><Yn label="ISSNs issued close together" v={item.evidence.issnBlock} />
        </p>
      </div>

      <div className="mt-3 border-t border-rule pt-3">
        <label className="sr-only" htmlFor={`note-${d.issn}`}>Note (optional)</label>
        <input id={`note-${d.issn}`} className="input max-w-md" placeholder="Note (optional)" maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
        <div className="mt-2 flex flex-wrap gap-2">
          {DECIDE.map(o => (
            <Button key={o.id} size="sm" variant={item.decision?.decision === o.id && !item.changedSinceDecision ? 'primary' : 'outline'} title={o.hint} disabled={busy} onClick={() => onDecide(item, o.id, note)}>{o.label}</Button>
          ))}
        </div>
        {item.decision && <p className="mt-2 text-[11.5px] text-muted">{DECISION_LABEL[item.decision.decision]} by {item.decision.by || 'an admin'} on {new Date(item.decision.at).toLocaleString()}{item.decision.note ? ` — “${item.decision.note}”` : ''}</p>}
      </div>
    </li>
  );
}

export function DoajConflicts() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Verdict | 'undecided' | 'decided'>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true); setError(null);
    const r = await api(`/api/admin/ingest/doaj-conflicts${refresh ? '?refresh=1' : ''}`);
    setLoading(false);
    if (!r.ok) { setError(r.data?.error || 'The conflicts could not be read.'); return; }
    setData(r.data);
  }, []);

  const decide = async (item: Item, decision: Decision, note: string) => {
    setBusy(item.doaj.issn);
    const r = await api('/api/admin/ingest/doaj-conflicts/decision', { method: 'POST', body: { issn: item.doaj.issn, decision, note, fingerprint: item.fingerprint } });
    setBusy(null);
    if (!r.ok) { toast.error(r.data?.error || 'The decision was not recorded.'); if (r.status === 409 || r.status === 404) load(); return; }
    toast.success(`${DECISION_LABEL[decision]}. Recorded only: no journal was created or changed.`);
    await load();
  };

  const shown = useMemo(() => (data?.items || []).filter(i => filter === 'all' ? true : filter === 'undecided' ? !i.decision : filter === 'decided' ? !!i.decision : i.verdict === filter), [data, filter]);
  const chips: ['all' | Verdict | 'undecided' | 'decided', string, number | undefined][] = data ? [
    ['all', 'All', data.summary.total], ['distinct', 'Likely distinct', data.summary.distinct], ['duplicate', 'Likely duplicate or renamed', data.summary.duplicate], ['ambiguous', 'Ambiguous', data.summary.ambiguous],
    ['undecided', 'Undecided', data.decisions.undecided], ['decided', 'Decided', data.summary.total - data.decisions.undecided],
  ] : [];

  return (
    <section className="card card-pad" aria-labelledby="doajconf-heading">
      <h2 id="doajconf-heading" className="text-base font-semibold text-ink">DOAJ Identity Conflicts</h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
        These DOAJ journals are not imported because their <b>title</b> is a journal we already hold under different ISSNs. A title is not an identity: they may be different journals that share a name, or
        the same journal under other ISSNs. Compare the two records, then record a decision. <b>Decisions are recorded only</b>: nothing is imported, and no journal is created or changed.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => load(!!data)} loading={loading} disabled={loading}>{data ? 'Reload from DOAJ' : 'Review Conflicts'}</Button>
      </div>
      {loading && !data && <p role="status" className="mt-3 text-[13px] text-muted">Reading DOAJ’s journal list and comparing it with the catalogue. This takes a few seconds.</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-alarm-soft px-3 py-2 text-[13px] text-ink">{error}</p>}

      {data && (
        <div className="mt-4">
          {data.summary.total === 0
            ? <p className="text-[13px] text-ink-2">No identity conflicts: no DOAJ journal shares a title with a held journal under different ISSNs.</p>
            : (
              <>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter conflicts">
                  {chips.map(([id, label, n]) => (
                    <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
                      className={`rounded-full border px-3 py-1 text-[12.5px] transition-colors ${filter === id ? 'border-accent bg-accent-soft font-semibold text-ink' : 'border-rule bg-surface text-ink-2 hover:bg-surface-2'}`}>
                      {label} <span className="tabular-nums text-muted">{N(n)}</span>
                    </button>
                  ))}
                </div>
                {data.decisions.lookAgain > 0 && <p role="status" className="mt-2 text-[12.5px] text-ink">{N(data.decisions.lookAgain)} decision{data.decisions.lookAgain === 1 ? '' : 's'} were made on evidence that has since changed.</p>}
                <ul className="mt-3 space-y-3">
                  {shown.map(i => <Card key={`${i.doaj.issn}-${i.fingerprint}`} item={i} onDecide={decide} busy={busy === i.doaj.issn} />)}
                </ul>
                {shown.length === 0 && <p className="mt-3 text-[13px] text-muted">Nothing in this view.</p>}
              </>
            )}
          <p className="mt-3 text-[11.5px] text-muted">Read from DOAJ’s list at {new Date(data.asOf).toLocaleTimeString()}. The verdict is a reading aid built from publisher, country, web address, DOAJ’s own “continues” links and the ISSN numbers; it is never applied automatically.</p>
        </div>
      )}
    </section>
  );
}
