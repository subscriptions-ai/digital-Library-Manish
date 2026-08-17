import { useState, useEffect } from 'react';

export interface PublicSettings {
  emailVerificationEnabled?: boolean;
  publisherSafeMode?: boolean;
}

let cache: PublicSettings | null = null;
let inflight: Promise<PublicSettings> | null = null;

async function fetchPublicSettings(): Promise<PublicSettings> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch('/api/public/settings')
      .then(r => r.json())
      .then((d: PublicSettings) => { cache = d || {}; return cache; })
      .catch(() => ({} as PublicSettings));
  }
  return inflight;
}

/** Returns true when Publisher Safe (Stealth) Mode is ON — commercial UI should be hidden. */
export function usePublisherSafeMode(): boolean {
  const [safe, setSafe] = useState<boolean>(cache?.publisherSafeMode ?? false);
  useEffect(() => {
    let mounted = true;
    fetchPublicSettings().then(s => { if (mounted) setSafe(Boolean(s.publisherSafeMode)); });
    return () => { mounted = false; };
  }, []);
  return safe;
}
