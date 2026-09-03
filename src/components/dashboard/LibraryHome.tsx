import React from 'react';
import { NavLink } from 'react-router-dom';
import { BookMarked, Layers, Heart } from 'lucide-react';
import { StructuredLibrary } from '../StructuredLibrary';
import { MyContentAccess } from './MyContentAccess';
import MyFavorites from './MyFavorites';

/**
 * One door to the collection.
 *
 * Browsing, seeing what a subscription covers, and what a reader has saved
 * were three sidebar entries that read as three libraries. Two of them led
 * somewhere the collection is not: My Library held only the legacy shelf, and
 * My Content Access counted every dataset but sent people to that same shelf.
 * They are the same library seen three ways, so they live under one heading
 * with the browse surface in front.
 *
 * The tab lives in the path rather than the query string because the browse
 * surface owns the query string — it mirrors every filter into it, and would
 * wipe a tab parameter on its first render.
 */

const TABS = [
  { to: '/dashboard/library', label: 'Browse', icon: BookMarked, end: true },
  { to: '/dashboard/library/access', label: 'My Access', icon: Layers, end: false },
  { to: '/dashboard/library/saved', label: 'Saved', icon: Heart, end: false },
];

export function LibraryHome({
  tab,
  viewerBasePath = '/dashboard/viewer',
}: { tab: 'browse' | 'access' | 'saved'; viewerBasePath?: string }) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-1 border-b border-rule">
        {TABS.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                isActive
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:border-rule-2 hover:text-ink-2'
              }`
            }
          >
            <t.icon size={16} />
            {t.label}
          </NavLink>
        ))}
      </div>

      {tab === 'browse' && <StructuredLibrary viewerBasePath={viewerBasePath} />}
      {tab === 'access' && <MyContentAccess />}
      {tab === 'saved' && <MyFavorites />}
    </div>
  );
}
