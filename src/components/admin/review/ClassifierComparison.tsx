import { useState } from 'react';
import { GitCompare } from 'lucide-react';
import { Badge, type BadgeTone } from '../../ui';
import { N, exactTime } from '../ingestion/format';

/**
 * Classifier v1 against classifier v2, over the same waiting books. v1 is what the ingestion engine uses and keeps using. v2 exists only here, for
 * comparison: it reads Dewey numbers as code evidence and no longer treats the bare word "rehabilitation" as Physiotherapy. Nothing on this card changes
 * a book; it stores a summary and an audit entry, and shows a bounded sample of the decisions that moved.
 */

const TIERS: { key: 'high' | 'medium' | 'low' | 'unclassifiable'; label: string; tone: BadgeTone }[] = [
  { key: 'high', label: 'High', tone: 'success' }, { key: 'medium', label: 'Medium', tone: 'accent' },
  { key: 'low', label: 'Low', tone: 'caution' }, { key: 'unclassifiable', label: 'Unclassifiable', tone: 'neutral' },
];
const KIND: Record<string, string> = {
  'rehabilitation': 'Rehabilitation false positive removed', 'upgraded-to-high': 'Upgraded to High', 'downgraded': 'Downgraded',
  'department-changed': 'Department changed', 'ddc-supported': 'Dewey-supported',
};
const dept = (d: string | null) => d ?? 'no department';

function Stat({ label, value, note }: { label: string; value: any; note?: string }) {
  return <div className="rounded-lg border border-rule p-3"><div className="text-[11px] text-muted">{label}</div><div className="text-xl font-semibold tabular-nums text-ink">{N(value)}</div>{note && <div className="text-[11px] text-muted">{note}</div>}</div>;
}

export function ClassifierComparison({ cmp, busy, running, onRun }: { cmp: any; busy: boolean; running: boolean; onRun: () => void }) {
  const [kind, setKind] = useState('');
  const [all, setAll] = useState(false);
  const matching: any[] = cmp ? cmp.sample.filter((s: any) => !kind || s.kind === kind) : [];
  const sample = all ? matching : matching.slice(0, 8);
  const providers = cmp ? Object.entries<any>(cmp.byProvider).sort((a, b) => b[1].analysed - a[1].analysed) : [];
  return (
    <section className="card card-pad" aria-label="Classifier v1 compared with v2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><GitCompare size={15} aria-hidden="true" /> Classifier v1 vs v2 <Badge tone="neutral">Analysis only</Badge></h3>
          <p className="mt-1 max-w-2xl text-[12.5px] text-ink-2">
            v1 is the classifier the ingestion engine uses; it is unchanged. v2 exists only for this comparison. It adds Dewey (DDC) numbers as code evidence, and the bare word “rehabilitation” no longer counts as Physiotherapy by itself.
            Comparing changes no book, department, licence, access or status.
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRun} disabled={running || busy}>{running ? 'Working…' : cmp ? 'Compare again' : 'Compare classifier v1 vs v2'}</button>
      </div>

      {!cmp ? <p className="mt-3 text-[13px] text-ink-2">Not compared yet. No figure is shown until the waiting books have been judged by both.</p> : (
        <>
          <p className="mt-3 text-[12px] text-muted">{N(cmp.analysed)} books judged by both · {exactTime(cmp.finishedAt)} · v1 = rules v{cmp.v1Version}, v2 = analysis classifier v{cmp.v2Version}</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-[12.5px]">
              <thead><tr className="text-left text-[11px] text-muted"><th className="py-1 font-medium">Confidence</th><th className="text-right font-medium">v1</th><th className="text-right font-medium">v2</th><th className="text-right font-medium">Change</th></tr></thead>
              <tbody>{TIERS.map(t => { const d = cmp.v2Tiers[t.key] - cmp.v1Tiers[t.key]; return (
                <tr key={t.key} className="border-t border-rule/60"><td className="py-1"><Badge tone={t.tone}>{t.label}</Badge></td><td className="text-right tabular-nums">{N(cmp.v1Tiers[t.key])}</td><td className="text-right font-semibold tabular-nums text-ink">{N(cmp.v2Tiers[t.key])}</td><td className={`text-right tabular-nums ${d > 0 ? 'text-ink' : 'text-muted'}`}>{d > 0 ? '+' : ''}{N(d)}</td></tr>); })}</tbody>
            </table>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Suggested department changed" value={cmp.changedDepartment} />
            <Stat label="Upgraded to High" value={cmp.upgradedToHigh} note={`${N(cmp.upgradedToHighFromLowOrMedium)} of them from Low or Medium`} />
            <Stat label="Upgraded (any tier)" value={cmp.upgraded} />
            <Stat label="Downgraded" value={cmp.downgraded} />
            <Stat label="Supported by a Dewey number" value={cmp.ddc.supportedClassifications} note={`${N(cmp.ddc.changedBecauseOfDdc)} changed department because of it`} />
            <Stat label="Rehabilitation false positives removed" value={cmp.rehabilitation.falsePositivesRemoved} />
            <Stat label="Books with Dewey data" value={cmp.ddc.withDdc} note={`${N(cmp.ddc.malformed)} malformed · ${N(cmp.ddc.ambiguous)} ambiguous · ${N(cmp.ddc.unmapped)} unmapped`} />
            <Stat label="Unchanged" value={cmp.unchanged} />
          </div>

          <div className="mt-4 grid gap-x-8 gap-y-4 lg:grid-cols-2">
            <div>
              <h4 className="mb-1 text-[12px] font-semibold text-ink">Biggest department moves (v1 → v2)</h4>
              {cmp.departmentMoves.length ? <ul className="space-y-0.5 text-[12.5px]">{cmp.departmentMoves.slice(0, 8).map((m: any) => <li key={`${m.from}>${m.to}`} className="flex justify-between gap-3"><span className="min-w-0 truncate text-ink-2">{dept(m.from === '(none)' ? null : m.from)} → {dept(m.to === '(none)' ? null : m.to)}</span><b className="tabular-nums text-ink">{N(m.n)}</b></li>)}</ul> : <p className="text-[12.5px] text-muted">No department moved.</p>}
            </div>
            <div>
              <h4 className="mb-1 text-[12px] font-semibold text-ink">Departments that gained or lost most</h4>
              {cmp.departmentNet.length ? <ul className="space-y-0.5 text-[12.5px]">{cmp.departmentNet.slice(0, 8).map((d: any) => <li key={d.department} className="flex justify-between gap-3"><span className="min-w-0 truncate text-ink-2">{d.department} <span className="text-muted">({N(d.v1)} → {N(d.v2)})</span></span><b className="tabular-nums text-ink">{d.net > 0 ? '+' : ''}{N(d.net)}</b></li>)}</ul> : <p className="text-[12.5px] text-muted">No department gained or lost books.</p>}
            </div>
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer select-none text-[12.5px] font-semibold text-ink hover:text-accent">By provider</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[560px] text-[12px]">
                <thead><tr className="text-left text-[11px] text-muted"><th className="py-1 font-medium">Provider</th><th className="text-right font-medium">Books</th><th className="text-right font-medium">High v1 → v2</th><th className="text-right font-medium">Dept changed</th><th className="text-right font-medium">Up</th><th className="text-right font-medium">Down</th><th className="text-right font-medium">Dewey</th><th className="text-right font-medium">Rehab. removed</th></tr></thead>
                <tbody>{providers.map(([name, p]) => <tr key={name} className="border-t border-rule/60"><td className="py-0.5">{name}</td><td className="text-right tabular-nums">{N(p.analysed)}</td><td className="text-right tabular-nums">{N(p.v1High)} → {N(p.v2High)}</td><td className="text-right tabular-nums">{N(p.changedDepartment)}</td><td className="text-right tabular-nums">{N(p.upgraded)}</td><td className="text-right tabular-nums">{N(p.downgraded)}</td><td className="text-right tabular-nums">{N(p.ddcSupported)}</td><td className="text-right tabular-nums">{N(p.rehabilitationRemoved)}</td></tr>)}</tbody>
              </table>
            </div>
          </details>

          <details className="mt-2">
            <summary className="cursor-pointer select-none text-[12.5px] font-semibold text-ink hover:text-accent">Where each book moved (v1 tier → v2 tier)</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[440px] text-[12px]">
                <thead><tr className="text-left text-[11px] text-muted"><th className="py-1 font-medium">v1 \ v2</th>{TIERS.map(t => <th key={t.key} className="text-right font-medium">{t.label}</th>)}</tr></thead>
                <tbody>{TIERS.map(a => <tr key={a.key} className="border-t border-rule/60"><td className="py-0.5 font-medium">{a.label}</td>{TIERS.map(b => <td key={b.key} className={`text-right tabular-nums ${a.key === b.key ? 'text-muted' : 'text-ink'}`}>{N(cmp.transitions[a.key][b.key])}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </details>

          <div className="mt-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h4 className="text-[12px] font-semibold text-ink">Sample of decisions that moved <span className="font-normal text-muted">· {cmp.sampleNote}</span></h4>
              <label className="field"><span className="sr-only">Kind of change</span>
                <select className="input" value={kind} onChange={e => { setKind(e.target.value); setAll(false); }}><option value="">All kinds</option>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            </div>
            {!sample.length ? <p className="mt-2 text-[12.5px] text-muted">Nothing of this kind in the sample.</p> : (
              <ul className="mt-2 divide-y divide-rule/60">
                {sample.map((s: any) => (
                  <li key={`${s.kind}-${s.id}`} className="py-2 text-[12.5px]">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="min-w-0 font-semibold text-ink">{s.title}</span><span className="text-[11px] text-muted">{KIND[s.kind]} · {s.source}</span></div>
                    <div className="text-ink-2">v1: {dept(s.v1.department)} ({s.v1.score}, {s.v1.tier}) → v2: <b className="text-ink">{dept(s.v2.department)}</b> ({s.v2.score}, {s.v2.tier})</div>
                    {s.why.length > 0 && <div className="text-[11.5px] text-muted">v2: {s.why.join(' · ')}</div>}
                  </li>))}
              </ul>
            )}
            {matching.length > 8 && <button type="button" className="btn btn-ghost btn-sm mt-1" onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${matching.length}`}</button>}
          </div>
        </>
      )}
    </section>
  );
}
