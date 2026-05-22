import React, { useState, useEffect, memo } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { Tooltip as ReactTooltip } from 'react-tooltip';
import { MapPin, Users, CreditCard, FileText, MessageSquare, TrendingUp, RefreshCw, IndianRupee } from 'lucide-react';

// Local GeoJSON — bundled in /public to avoid CDN issues
const GEO_URL = '/india-states-simple.geojson';

// Resolve GeoJSON NAME_1 → canonical state name
const GEO_NAME_MAP: Record<string, string> = {
  'Andaman and Nicobar':    'Andaman & Nicobar Islands',
  'Jammu and Kashmir':      'Jammu & Kashmir',
  'Orissa':                 'Odisha',
  'Uttaranchal':            'Uttarakhand',
  'Dadra and Nagar Haveli': 'Dadra & Nagar Haveli',
  'Daman and Diu':          'Daman & Diu',
};

type StateEntry = { users: number; quotations: number; contacts: number; total: number };
type Meta = {
  stateUsers: number; stateQuotations: number; stateContacts: number;
  activeStates: number; totalUsers: number; totalSubscriptions: number; totalRevenue: number;
};

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// Color scale: light blue → deep indigo
function stateColor(total: number, max: number): string {
  if (!total || !max) return '#e8f0fe'; // empty but visible
  const t = Math.pow(Math.min(total / max, 1), 0.4);
  return `rgb(${Math.round(lerp(147,30,t))},${Math.round(lerp(197,64,t))},${Math.round(lerp(253,175,t))})`;
}

const EMPTY: StateEntry = { users: 0, quotations: 0, contacts: 0, total: 0 };

const IndiaStateHeatmap = () => {
  const [stateMap, setStateMap] = useState<Record<string, StateEntry>>({});
  const [meta, setMeta] = useState<Meta>({
    stateUsers: 0, stateQuotations: 0, stateContacts: 0,
    activeStates: 0, totalUsers: 0, totalSubscriptions: 0, totalRevenue: 0
  });
  const [loading, setLoading] = useState(true);
  const [activeState, setActiveState] = useState<string | null>(null);
  const [geoReady, setGeoReady] = useState(false);

  const fetchData = () => {
    setLoading(true);
    fetch('/api/admin/india-state-stats', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setStateMap(data.stateMap || {});
          setMeta(data.meta || meta);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const maxTotal = Math.max(...Object.values(stateMap).map(d => d.total), 1);
  const ranked = Object.entries(stateMap).sort((a, b) => b[1].total - a[1].total).slice(0, 8);

  const fmt = (n: number) => n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : n >= 1000 ? `₹${(n/1000).toFixed(1)}K` : `₹${n}`;

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <MapPin size={14} className="text-blue-500" /> India Client Distribution
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Platform-wide activity across Indian states</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {/* Platform-wide stats (always real) */}
            {[
              { val: meta.totalUsers,         label: 'Total Users',   color: 'text-blue-700',   icon: <Users size={12} className="text-blue-400" /> },
              { val: meta.totalSubscriptions, label: 'Active Subs',   color: 'text-emerald-700',icon: <CreditCard size={12} className="text-emerald-400" /> },
              { val: meta.stateQuotations,    label: 'Quotations',    color: 'text-indigo-700', icon: <FileText size={12} className="text-indigo-400" /> },
              { val: meta.stateContacts,      label: 'Contacts',      color: 'text-violet-700', icon: <MessageSquare size={12} className="text-violet-400" /> },
            ].map(s => (
              <div key={s.label} className="text-center bg-slate-50 rounded-2xl px-4 py-2.5 min-w-[72px]">
                <div className="flex items-center justify-center gap-1 mb-0.5">{s.icon}</div>
                <p className={`text-lg font-black ${s.color} leading-none`}>{s.val}</p>
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mt-0.5">{s.label}</p>
              </div>
            ))}
            <button onClick={fetchData} title="Refresh"
              className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors ml-1">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* ── Map Panel ── */}
        <div className="relative flex-1 bg-gradient-to-br from-blue-50/40 via-indigo-50/20 to-slate-50 flex items-center justify-center min-h-[500px] p-3">

          {/* Legend */}
          <div className="absolute bottom-4 left-5 flex items-center gap-2 z-10">
            <span className="text-[10px] text-slate-500 font-semibold">No data</span>
            <div className="w-24 h-2 rounded-full" style={{ background: 'linear-gradient(to right, #e8f0fe, rgb(30,64,175))' }} />
            <span className="text-[10px] text-slate-500 font-semibold">High</span>
          </div>

          {/* Note if no state-level data */}
          {!loading && meta.activeStates === 0 && (
            <div className="absolute top-3 left-0 right-0 flex justify-center z-10">
              <span className="bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold px-3 py-1 rounded-full">
                ℹ️ Map shows shape — state-specific data populates as users add their state
              </span>
            </div>
          )}

          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ center: [82.8, 22.5], scale: 1080 }}
            width={520}
            height={540}
            style={{ width: '100%', height: '100%', maxHeight: 510 }}
          >
            <Geographies geography={GEO_URL} onError={(e) => console.error('GeoJSON load error:', e)}>
              {({ geographies }) => {
                if (!geoReady && geographies.length > 0) setTimeout(() => setGeoReady(true), 100);
                return geographies.map(geo => {
                  const rawName: string = geo.properties?.NAME_1 || '';
                  const stateName = GEO_NAME_MAP[rawName] || rawName;
                  const data = stateMap[stateName] || EMPTY;
                  const isHovered = activeState === stateName;

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={isHovered ? '#1d4ed8' : stateColor(data.total, maxTotal)}
                      stroke="#ffffff"
                      strokeWidth={0.8}
                      data-tooltip-id="india-tip"
                      data-tooltip-content={
                        data.total > 0
                          ? `${stateName}: ${data.users} users · ${data.quotations} quotes · ${data.contacts} contacts`
                          : `${stateName}: No state-specific data yet`
                      }
                      onMouseEnter={() => setActiveState(stateName)}
                      onMouseLeave={() => setActiveState(null)}
                      style={{
                        default: { outline: 'none', transition: 'fill 0.18s ease' },
                        hover:   { outline: 'none', cursor: 'pointer' },
                        pressed: { outline: 'none' },
                      }}
                    />
                  );
                });
              }}
            </Geographies>
          </ComposableMap>

          {/* Loading spinner overlay while map tiles load */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-[2px]">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-500 font-medium">Loading map data…</span>
              </div>
            </div>
          )}

          <ReactTooltip
            id="india-tip"
            style={{ background: '#0f172a', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '8px 12px' }}
          />
        </div>

        {/* ── Right Panel ── */}
        <div className="lg:w-60 xl:w-72 border-t lg:border-t-0 lg:border-l border-slate-100 bg-white flex flex-col">

          {/* Revenue highlight */}
          {meta.totalRevenue > 0 && (
            <div className="mx-4 mt-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-4 text-white">
              <div className="flex items-center gap-2 mb-1">
                <IndianRupee size={14} />
                <span className="text-[10px] font-extrabold uppercase tracking-widest opacity-80">Total Revenue</span>
              </div>
              <p className="text-2xl font-black">{fmt(meta.totalRevenue)}</p>
            </div>
          )}

          {/* State leaderboard */}
          <div className="p-4 flex flex-col gap-1.5 flex-1">
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
              <TrendingUp size={10} /> State Leaderboard
            </p>

            {ranked.length === 0 ? (
              <div className="flex flex-col gap-2 pt-2">
                <p className="text-xs text-slate-400 font-medium">No state-mapped data yet.</p>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  When users fill in their state during registration, or submit quotations/contact forms with a state, activity will appear here and color the map.
                </p>
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 mb-1">Platform totals (all users):</p>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 flex items-center gap-1.5"><Users size={11} className="text-blue-400"/>Registered Users</span>
                      <span className="font-black text-blue-700">{meta.totalUsers}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 flex items-center gap-1.5"><CreditCard size={11} className="text-emerald-400"/>Active Subscriptions</span>
                      <span className="font-black text-emerald-700">{meta.totalSubscriptions}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : ranked.map(([name, data], i) => (
              <div
                key={name}
                onMouseEnter={() => setActiveState(name)}
                onMouseLeave={() => setActiveState(null)}
                className={`rounded-xl px-3 py-2.5 cursor-pointer transition-all ${activeState === name ? 'bg-blue-50 border border-blue-200 shadow-sm' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-black text-slate-400 shrink-0 w-5">#{i + 1}</span>
                    <span className="text-xs font-bold text-slate-800 truncate">{name}</span>
                  </div>
                  <span className="text-xs font-black text-blue-700 ml-2 shrink-0">{data.total}</span>
                </div>
                {/* Stacked colour bar: blue=users, indigo=quotations, violet=contacts */}
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden flex">
                  {data.users > 0 && <div className="h-full bg-blue-500" style={{ width: `${(data.users/data.total)*100}%` }} />}
                  {data.quotations > 0 && <div className="h-full bg-indigo-500" style={{ width: `${(data.quotations/data.total)*100}%` }} />}
                  {data.contacts > 0 && <div className="h-full bg-violet-500" style={{ width: `${(data.contacts/data.total)*100}%` }} />}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {data.users > 0 && <span className="text-[9px] text-blue-600 font-semibold">{data.users} user{data.users > 1 ? 's' : ''}</span>}
                  {data.quotations > 0 && <span className="text-[9px] text-indigo-600 font-semibold">{data.quotations} quote{data.quotations > 1 ? 's' : ''}</span>}
                  {data.contacts > 0 && <span className="text-[9px] text-violet-600 font-semibold">{data.contacts} contact{data.contacts > 1 ? 's' : ''}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="border-t border-slate-100 p-4">
            <div className="flex items-center gap-3 text-[10px] text-slate-400 flex-wrap">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />Users</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />Quotations</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-violet-500 inline-block" />Contacts</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(IndiaStateHeatmap);
