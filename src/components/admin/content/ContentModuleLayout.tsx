import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { List, PlusCircle, Upload } from 'lucide-react';

const CONTENT_TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  'Books':                   { icon: '📚', label: 'Books', color: 'blue' },
  'Periodicals':             { icon: '📰', label: 'Periodicals', color: 'indigo' },
  'Magazines':               { icon: '🗞️', label: 'Magazines', color: 'violet' },
  'Case Reports':            { icon: '📋', label: 'Case Reports', color: 'purple' },
  'Theses':                  { icon: '🎓', label: 'Theses', color: 'pink' },
  'Conference Proceedings':  { icon: '🧑‍🤝‍🧑', label: 'Conference Proceedings', color: 'rose' },
  'Educational Videos':      { icon: '🎬', label: 'Educational Videos', color: 'orange' },
  'Newsletters':             { icon: '📩', label: 'Newsletters', color: 'amber' },
};

interface ContentModuleLayoutProps {
  contentType: string;
  children: React.ReactNode;
}

export function ContentModuleLayout({ contentType, children }: ContentModuleLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const config = CONTENT_TYPE_CONFIG[contentType] || { icon: '📄', label: contentType, color: 'slate' };

  const slug = contentType.toLowerCase().replace(/\s+/g, '-');
  const basePath = `/admin/${slug}`;

  const tabs = [
    { label: 'All Entries', path: basePath, icon: <List size={15} /> },
    { label: 'Add New', path: `${basePath}/new`, icon: <PlusCircle size={15} /> },
    { label: 'Bulk Import', path: `${basePath}/import`, icon: <Upload size={15} /> },
  ];

  return (
    <div className="space-y-5">
      {/* Module Header */}
      <div className="flex items-center gap-3">
        <div className={`text-3xl`}>{config.icon}</div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{config.label}</h1>
          <p className="text-sm text-slate-500">Manage all {config.label.toLowerCase()} in your library.</p>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {children}
    </div>
  );
}
