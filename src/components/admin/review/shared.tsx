import { useEffect, useState } from 'react';
import { api } from '../ingestion/api';
import { N } from '../ingestion/format';

/** What the server says about department assignment: is it switched on, which thresholds are approved, which departments exist. */
export type AssignmentConfig = {
  enabled: boolean; gateMessage: string | null; thresholds: { highMinScore: number; highMinMargin: number; highRequiresCode: boolean; mediumMinScore: number; mediumMinMargin: number } | null; thresholdsProblem: string | null;
  chunk: number; departments: string[]; batchLimit: number;
  /** Publication has a gate of its own: it is off unless the deployment says so, whatever the assignment gate is. */
  publish?: { enabled: boolean; message: string | null };
};

export function useAssignmentConfig() {
  const [config, setConfig] = useState<AssignmentConfig | null>(null);
  useEffect(() => { let alive = true; api('/api/admin/review/assignment/config').then(r => { if (alive && r.ok) setConfig(r.data); }); return () => { alive = false; }; }, []);
  return config;
}

/** "Requested 8,214 · Assigned 7,980 · Skipped 211 · Failed 23", then the skip reasons grouped. */
export function Tally({ t, assignedLabel = 'Assigned' }: { t: { requested: number; assigned: number; skipped: number; failed: number; skippedReasons?: Record<string, number> }; assignedLabel?: string }) {
  const reasons = Object.entries(t.skippedReasons || {}).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([['Requested', t.requested], [assignedLabel, t.assigned], ['Skipped', t.skipped], ['Failed', t.failed]] as const).map(([l, v]) => (
          <div key={l}><dt className="text-[11px] text-muted">{l}</dt><dd className="text-xl font-semibold tabular-nums text-ink">{N(v)}</dd></div>
        ))}
      </dl>
      {reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[12.5px] text-ink-2">
          {reasons.map(([label, n]) => <li key={label} className="flex justify-between gap-3"><span>{label}</span><b className="tabular-nums text-ink">{N(n)}</b></li>)}
        </ul>
      )}
    </div>
  );
}

/** The sentence under every assignment action: what it does and what it never does. */
export function WillWont() {
  return (
    <div className="grid gap-3 text-[12.5px] sm:grid-cols-2">
      <div><div className="mb-1 font-semibold text-ink">This WILL</div>
        <ul className="space-y-0.5 text-ink-2"><li>✓ assign the department</li><li>✓ keep the book a Draft</li><li>✓ record the classifier evidence on the book</li><li>✓ skip any book that has changed since it was selected</li></ul></div>
      <div><div className="mb-1 font-semibold text-ink">This WILL NOT</div>
        <ul className="space-y-0.5 text-ink-2"><li>✕ publish any book</li><li>✕ change licence, access or rights</li><li>✕ overwrite an assigned department</li><li>✕ touch rejected records</li></ul></div>
    </div>
  );
}

/** The sentence under every publication action: it makes books PUBLIC, and what it will not do to get a book through. */
export function PublishWillWont({ medium }: { medium?: boolean }) {
  return (
    <div className="space-y-3 text-[12.5px]">
      <div className="rounded-lg border border-caution/40 bg-surface-2 p-2.5 text-ink-2"><b className="text-ink">This puts books on the public catalogue.</b> {medium ? 'These books meet the publication rules, but the confidence in their department is lower than High.' : 'Confidence is only confidence in the department: every book must also pass the publication rules.'}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><div className="mb-1 font-semibold text-ink">This action will</div>
          <ul className="space-y-0.5 text-ink-2"><li>✓ assign a missing, revalidated department</li><li>✓ publish only the books that pass every rule right now</li><li>✓ skip unsafe or changed books</li><li>✓ record the result in Review History</li></ul></div>
        <div><div className="mb-1 font-semibold text-ink">This action will NOT</div>
          <ul className="space-y-0.5 text-ink-2"><li>✕ overwrite a department</li><li>✕ override a licence restriction or change rights or access</li><li>✕ reopen a rejected book</li><li>✕ bypass any publication rule</li></ul></div>
      </div>
    </div>
  );
}
