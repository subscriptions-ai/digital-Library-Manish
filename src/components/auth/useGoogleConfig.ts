import { useEffect, useState } from 'react';
import { loadGoogleConfig, type GoogleConfig } from '../../lib/google';

/** 'loading' until the server has said whether Google sign-in is on; then the answer. Pages show the Google option only for 'on'. */
export function useGoogleConfig(): { state: 'loading' | 'on' | 'off'; clientId: string } {
  const [config, setConfig] = useState<GoogleConfig | null>(null);
  useEffect(() => {
    let live = true;
    loadGoogleConfig().then(c => { if (live) setConfig(c); });
    return () => { live = false; };
  }, []);
  return config ? { state: config.enabled ? 'on' : 'off', clientId: config.clientId } : { state: 'loading', clientId: '' };
}
