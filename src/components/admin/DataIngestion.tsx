import { useCallback, useEffect, useState } from 'react';
import { EngineStatus } from './ingestion/EngineStatus';
import { EngineMode } from './ingestion/EngineMode';
import { Metrics } from './ingestion/Metrics';
import { RunActivity } from './ingestion/RunActivity';
import { EngineSettings } from './ingestion/EngineSettings';
import { ScopePanel } from './ingestion/ScopePanel';
import { DoajImport } from './ingestion/DoajImport';
import { OneOffImport } from './ingestion/OneOffImport';
import { Coverage } from './ingestion/Coverage';
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
  const [tab, setTab] = useState<'log' | 'coverage'>('log');
  const [bump, setBump] = useState(0);

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
      <Metrics state={state} />

      <div className="segmented" role="tablist" aria-label="Activity view">
        {([['log', 'Run activity'], ['coverage', 'Coverage']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'log' ? <RunActivity refreshKey={bump} /> : <Coverage coverage={coverage} />}

      <EngineSettings state={state} onChanged={changed} />
      <DoajImport onDone={changed} />
      <OneOffImport engineRunning={!!state.enabled} onDone={changed} />
    </div>
  );
}
