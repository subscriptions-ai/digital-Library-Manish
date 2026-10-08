import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Talking to the ingestion API.
 *
 * Two rules the old screen broke: state is always loaded from the server first (never seeded from a frontend default,
 * so a refactor of the screen cannot overwrite a saved setting), and a failure is reported as what it was — never as
 * a success, and never as a number that happens to be zero.
 */

export type ApiResult<T = any> = { ok: boolean; status: number; data: T };

export async function api<T = any>(path: string, opts: { method?: 'GET' | 'POST'; body?: any } = {}): Promise<ApiResult<T>> {
  try {
    const r = await fetch(path, {
      method: opts.method || 'GET',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'Could not reach the server.' } as any };
  }
}

/** Download a response as a file, with the auth header a plain link cannot carry. */
export async function download(path: string, filename: string): Promise<boolean> {
  try {
    const r = await fetch(path, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
    if (!r.ok) return false;
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  } catch { return false; }
}

/** The engine's state, loaded from the server and kept fresh. */
export function useEngineState(intervalMs = 10_000) {
  const [state, setState] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    const r = await api('/api/admin/ingest/state');
    if (!alive.current) return null;
    if (r.ok) { setState(r.data); setError(null); return r.data; }
    setError(r.data?.error || 'Could not load the ingestion engine.');
    return null;
  }, []);

  useEffect(() => {
    alive.current = true; load();
    const t = setInterval(load, intervalMs);      // it moves on its own; keep up with it
    return () => { alive.current = false; clearInterval(t); };
  }, [load, intervalMs]);

  return { state, error, reload: load, setState };
}

/** Poll a server job until it stops running. */
export function pollJob(jobId: string, onUpdate: (job: any) => void, intervalMs = 2000): () => void {
  let stop = false;
  const tick = async () => {
    if (stop) return;
    const r = await api(`/api/admin/ingest/status/${jobId}`);
    if (stop) return;
    if (!r.ok) { onUpdate({ status: 'error', error: r.status === 404 ? 'The server no longer has this job. If it was an import, check the run activity before starting it again.' : (r.data?.error || 'Lost track of the job') }); return; }
    onUpdate(r.data);
    if (r.data.status === 'running') setTimeout(tick, intervalMs);
  };
  tick();
  return () => { stop = true; };
}
