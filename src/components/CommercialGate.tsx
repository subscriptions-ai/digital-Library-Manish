import React from 'react';
import { Navigate } from 'react-router-dom';
import { useHidePricing } from '../lib/publicSettings';

/**
 * Wraps a commercial public route (pricing, cart, checkout, quotations, agency).
 * When "Hide pricing" is ON, visitors are sent to Contact Us instead — so the
 * public site never surfaces prices or a buy flow. Turning the setting off
 * restores the pages, so nothing is lost.
 */
export function CommercialGate({ children }: { children: React.ReactNode }) {
  const hide = useHidePricing();
  if (hide) return <Navigate to="/contact" replace />;
  return <>{children}</>;
}
