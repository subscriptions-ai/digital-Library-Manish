import React, { memo } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { Tooltip as ReactTooltip } from 'react-tooltip';

// Using a lightweight topojson for world map without bringing in huge dependencies
const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

interface UsersGeoMapProps {
  stats: any;
}

const UsersGeoMap = ({ stats }: UsersGeoMapProps) => {
  if (!stats?.geoPoints) return null;

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 relative w-full overflow-hidden min-h-[400px] flex flex-col">
      <div className="flex items-center justify-between mb-4 z-10">
        <div>
          <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest">Global Distribution</h2>
          <p className="text-xs text-slate-500 mt-1">User concentration by region</p>
        </div>
      </div>

      <div className="flex-1 w-full -mx-4 sm:mx-0 relative">
        <ComposableMap
          projectionConfig={{ scale: 140 }}
          width={800}
          height={400}
          style={{ width: "100%", height: "100%" }}
        >
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#f1f5f9"
                  stroke="#e2e8f0"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: "none" },
                    hover: { fill: "#e2e8f0", outline: "none" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {stats.geoPoints.map(({ id, coordinates, value }: any) => (
            <Marker key={id} coordinates={coordinates as [number, number]}>
              <circle
                r={Math.max(4, value / 40)}
                fill="#3b82f6"
                fillOpacity={0.6}
                stroke="#2563eb"
                strokeWidth={2}
                data-tooltip-id="geo-tooltip"
                data-tooltip-content={`${id}: ${value} users`}
                className="cursor-pointer hover:fillOpacity-100 transition-all outline-none"
              />
            </Marker>
          ))}
        </ComposableMap>
        
        <ReactTooltip 
          id="geo-tooltip" 
          place="top" 
          style={{ backgroundColor: '#0f172a', color: '#fff', fontWeight: 'bold', fontSize: '11px', borderRadius: '8px' }}
        />
      </div>
    </div>
  );
};

export default memo(UsersGeoMap);
