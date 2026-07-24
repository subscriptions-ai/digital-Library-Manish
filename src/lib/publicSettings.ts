import { useState, useEffect } from 'react';

export interface PublicSettings {
  emailVerificationEnabled?: boolean;
  publisherSafeMode?: boolean;
  hidePricing?: boolean;
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

/**
 * Returns true when "Hide pricing" is ON — every commercial element (prices,
 * cart, checkout, subscribe/upgrade CTAs) must be hidden from the public site,
 * while search, journals and browsing stay fully visible. Also true whenever
 * stealth (publisherSafeMode) is on, since that hides commercial UI too.
 */
export function useHidePricing(): boolean {
  const [hide, setHide] = useState<boolean>(Boolean(cache?.hidePricing || cache?.publisherSafeMode));
  useEffect(() => {
    let mounted = true;
    fetchPublicSettings().then(s => { if (mounted) setHide(Boolean(s.hidePricing || s.publisherSafeMode)); });
    return () => { mounted = false; };
  }, []);
  return hide;
}
