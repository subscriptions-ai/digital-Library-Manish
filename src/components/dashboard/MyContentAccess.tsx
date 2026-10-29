import React from 'react';
import { AccessOverview } from '../library/AccessOverview';

/** The reader dashboard's "My Access" tab. The overview is shared with the institution dashboard; only where Browse leads differs. */
export function MyContentAccess() {
  return <AccessOverview browseBase="/dashboard/library" />;
}
