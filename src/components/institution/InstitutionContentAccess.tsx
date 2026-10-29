import React from 'react';
import { AccessOverview } from '../library/AccessOverview';

/** The institution dashboard's "My Content Access". The overview is shared with the reader dashboard; only where Browse leads differs. */
export function InstitutionContentAccess() {
  return <AccessOverview browseBase="/institution/explore" />;
}
