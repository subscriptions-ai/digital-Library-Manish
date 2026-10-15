import { useCallback, useEffect, useState } from 'react';
import { EngineStatus } from './ingestion/EngineStatus';
import { EngineMode } from './ingestion/EngineMode';
import { RotationStatus } from './ingestion/RotationStatus';
import { Metrics } from './ingestion/Metrics';
import { RunActivity } from './ingestion/RunActivity';
import { EngineSettings } from './ingestion/EngineSettings';
import { ScopePanel } from './ingestion/ScopePanel';
import { DoajImport } from './ingestion/DoajImport';
import { OneOffImport } from './ingestion/OneOffImport';
import { Coverage } from './ingestion/Coverage';
import { BookCoverage } from './ingestion/BookCoverage';
import { CatalogueGrowth } from './ingestion/CatalogueGrowth';
import { BulkExpansion } from './ingestion/BulkExpansion';
import { api, useEngineState } from './ingestion/api';

/**
 * /admin/ingestion — the continuous engine, what it has done, and the two ways to bring material in by hand.
 *
 * Every value on this screen is read from the server first. Nothing here seeds a setting from a default, and
 * nothing is saved as a side-effect of typing: changes are explicit, validated on the server, and audited.
 */
export function DataIngestion() {
  const { state, error, reload } = useEngineState();
  const [coverage, setCoverage] = useState<any[] | null>(null);
  const [tab, setTab] = useState<'log' | 'coverage' | 'books' | 'growth' | 'bulk'>('log');
  const [bump, setBump] = useState(0);
  // The department filter belongs to the page, so a click in Coverage can set it. Dates, kind, source and result belong to Run activity.
  const [department, setDepartment] = useState('');

  const loadCoverage = useCallback(async () => { const r = await api('/api/admin/ingest/coverage'); if (r.ok) setCoverage(r.data.coverage); }, []);
  useEffect(() => { loadCoverage(); const t = setInterval(loadCoverage, 60_000); return () => clearInterval(t); }, [loadCoverage]);

  const changed = useCallback(() => { reload(); setBump(b => b + 1); loadCoverage(); }, [reload, loadCoverage]);

  if (error && !state) {
    return <div className="mx-auto max-w-3xl p-6"><p role="alert" className="rounded-xl border border-alarm/40 bg-alarm-soft px-4 py-3 text-sm text-ink">{error} Nothing is changed. Reload the page to try again.</p></div>;
  }
  if (!state) {
    return <div className="mx-auto max-w-6xl space-y-4 p-6" aria-busy="true"><span className="skeleton block h-40 w-full" /><span className="skeleton block h-24 w-full" /><span className="skeleton block h-64 w-full" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Data ingestion</h1>
        <p className="mt-1 text-[13.5px] text-muted">Bring catalogued material in from open sources — nothing already held is removed or overwritten.</p>
      </header>

      <EngineStatus state={state} onChanged={changed} />
      <ScopePanel state={state} onChanged={changed} />
      <EngineMode state={state} coverage={coverage || []} onChanged={changed} />
      <RotationStatus state={state} />
      <Metrics state={state} />

      <div className="segmented" role="tablist" aria-label="Activity view">
        {([['log', 'Run activity'], ['coverage', 'Coverage'], ['books', 'Book coverage'], ['growth', 'Catalogue growth'], ['bulk', 'Bulk expansion']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'log' ? (
        <RunActivity refreshKey={bump} department={department} onDepartment={setDepartment} />
      ) : tab === 'coverage' ? (
        <Coverage coverage={coverage} selected={department} onSelect={d => { setDepartment(d); setTab('log'); }} />
      ) : tab === 'books' ? (
        <BookCoverage onChanged={changed} />
      ) : tab === 'growth' ? (
        <CatalogueGrowth />
      ) : (
        <BulkExpansion onChanged={changed} />
      )}

      <EngineSettings state={state} onChanged={changed} />
      <DoajImport onDone={changed} />
      <OneOffImport engineRunning={!!state.enabled} onDone={changed} />
    </div>
  );
}
