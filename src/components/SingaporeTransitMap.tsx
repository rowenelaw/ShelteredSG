import React, { useMemo, useState } from 'react';
import { CloudRain, Layers, LocateFixed, ShieldCheck, ZoomIn, ZoomOut } from 'lucide-react';
import {
  EXPRESSWAY_CORRIDORS,
  projectSgCoords,
  PULAU_UBIN_POLYGON,
  SENTOSA_POLYGON,
  SINGAPORE_BUS_STOPS,
  SINGAPORE_ISLAND_POLYGON,
} from '../data/singaporeTransitData';
import {
  BusStop,
  ComputedBusRoute,
  RainCell,
  SingaporeLocation,
  WeatherSnapshot,
} from '../types/transit';

interface SingaporeTransitMapProps {
  weather: WeatherSnapshot;
  origin?: SingaporeLocation | null;
  destination?: SingaporeLocation | null;
  selectedRoute?: ComputedBusRoute | null;
  selectedStopId?: string | null;
  onSelectStop?: (stop: BusStop) => void;
  radarFocusMode?: boolean;
  heightClass?: string;
}

function polygonToPath(coords: [number, number][]): string {
  return (
    coords
      .map(([lat, lng], i) => {
        const { x, y } = projectSgCoords(lat, lng);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ') + ' Z'
  );
}

function lineToPath(coords: { lat: number; lng: number }[]): string {
  return coords
    .map((pt, i) => {
      const { x, y } = projectSgCoords(pt.lat, pt.lng);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function getRainColor(cell: RainCell): { fill: string; stroke: string } {
  switch (cell.severity) {
    case 'thundery':
      return { fill: 'rgba(220, 38, 38, 0.28)', stroke: 'rgba(185, 28, 28, 0.55)' };
    case 'heavy':
      return { fill: 'rgba(37, 99, 235, 0.30)', stroke: 'rgba(29, 78, 216, 0.55)' };
    case 'moderate':
      return { fill: 'rgba(59, 130, 246, 0.22)', stroke: 'rgba(37, 99, 235, 0.4)' };
    case 'light':
      return { fill: 'rgba(14, 165, 233, 0.14)', stroke: 'rgba(2, 132, 199, 0.28)' };
    default:
      return { fill: 'rgba(148, 163, 184, 0.05)', stroke: 'rgba(148, 163, 184, 0.15)' };
  }
}

export const SingaporeTransitMap: React.FC<SingaporeTransitMapProps> = ({
  weather,
  origin,
  destination,
  selectedRoute,
  selectedStopId,
  onSelectStop,
  radarFocusMode = false,
  heightClass = 'h-[620px]',
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showRainLayer, setShowRainLayer] = useState(true);
  const [showShelterLayer, setShowShelterLayer] = useState(!radarFocusMode);
  const [showAllStops, setShowAllStops] = useState(!radarFocusMode);
  const [hoveredStop, setHoveredStop] = useState<BusStop | null>(null);
  const [hoveredCell, setHoveredCell] = useState<RainCell | null>(null);

  const islandPath = useMemo(() => polygonToPath(SINGAPORE_ISLAND_POLYGON), []);
  const sentosaPath = useMemo(() => polygonToPath(SENTOSA_POLYGON), []);
  const ubinPath = useMemo(() => polygonToPath(PULAU_UBIN_POLYGON), []);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.18 : -0.18;
    setZoom((z) => Math.min(3.2, Math.max(0.85, Math.round((z + delta) * 100) / 100)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const focusSelectedRoute = () => {
    if (!origin || !destination) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const oPt = projectSgCoords(origin.lat, origin.lng);
    const dPt = projectSgCoords(destination.lat, destination.lng);
    const midX = (oPt.x + dPt.x) / 2;
    const midY = (oPt.y + dPt.y) / 2;
    const spanX = Math.abs(oPt.x - dPt.x);
    const spanY = Math.abs(oPt.y - dPt.y);
    const span = Math.max(spanX, spanY, 80);
    const nextZoom = Math.min(2.6, Math.max(1.05, 420 / span));
    setZoom(Math.round(nextZoom * 100) / 100);
    setPan({
      x: (500 - midX) * nextZoom * 0.65,
      y: (310 - midY) * nextZoom * 0.65,
    });
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Highlighted stop IDs from current route
  const routeStopIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedRoute) {
      selectedRoute.legs.forEach((leg) => {
        if (leg.fromStopCode) ids.add(leg.fromStopCode);
        if (leg.toStopCode) ids.add(leg.toStopCode);
      });
    }
    return ids;
  }, [selectedRoute]);

  return (
    <div
      className={`relative w-full ${heightClass} bg-sky-50/70 border border-slate-200 rounded-xl overflow-hidden select-none`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Top-left map layer toggles */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1.5 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setShowRainLayer((v) => !v)}
          className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            showRainLayer
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <CloudRain className="w-3.5 h-3.5" />
          Rain Radar
        </button>
        <button
          type="button"
          onClick={() => setShowShelterLayer((v) => !v)}
          className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            showShelterLayer
              ? 'bg-emerald-700 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Sheltered Stops
        </button>
        <button
          type="button"
          onClick={() => setShowAllStops((v) => !v)}
          className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            showAllStops
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Bus Network
        </button>
      </div>

      {/* Top-right zoom & focus controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(3.2, Math.round((z + 0.35) * 100) / 100))}
          aria-label="Zoom in map"
          className="w-8 h-8 flex items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.85, Math.round((z - 0.35) * 100) / 100))}
          aria-label="Zoom out map"
          className="w-8 h-8 flex items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={origin && destination ? focusSelectedRoute : resetView}
          aria-label="Fit route or reset map view"
          title={origin && destination ? 'Fit journey' : 'Reset Singapore view'}
          className="w-8 h-8 flex items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <LocateFixed className="w-4 h-4" />
        </button>
      </div>

      {/* Interactive SVG Singapore Map */}
      <svg
        viewBox="0 0 1000 620"
        className={`w-full h-full ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        role="img"
        aria-label="Interactive Singapore Bus Route and Rain Radar Map"
      >
        <defs>
          <radialGradient id="rainThundery" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#dc2626" stopOpacity="0.48" />
            <stop offset="55%" stopColor="#2563eb" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="rainHeavy" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.44" />
            <stop offset="65%" stopColor="#3b82f6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="rainModerate" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.30" />
            <stop offset="70%" stopColor="#60a5fa" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#93c5fd" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="rainLight" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0284c7" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g
          transform={`translate(${500 + pan.x}, ${310 + pan.y}) scale(${zoom}) translate(-500, -310)`}
        >
          {/* Johor Strait / Singapore Strait subtle grid */}
          <g stroke="#bae6fd" strokeWidth="0.6" opacity="0.5">
            {[120, 240, 360, 480].map((y) => (
              <line key={`hy_${y}`} x1="0" y1={y} x2="1000" y2={y} />
            ))}
            {[160, 320, 480, 640, 800].map((x) => (
              <line key={`vx_${x}`} x1={x} y1="0" x2={x} y2="620" />
            ))}
          </g>

          {/* Singapore Landmasses */}
          <path
            d={islandPath}
            fill="#f8fafc"
            stroke="#94a3b8"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d={sentosaPath}
            fill="#f8fafc"
            stroke="#94a3b8"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d={ubinPath}
            fill="#f1f5f9"
            stroke="#cbd5e1"
            strokeWidth="1"
            strokeLinejoin="round"
          />

          {/* Major Expressway Corridors */}
          <g fill="none" stroke="#e2e8f0" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            {EXPRESSWAY_CORRIDORS.map((corridor) => (
              <path
                key={corridor.name}
                d={lineToPath(corridor.points.map(([lat, lng]) => ({ lat, lng })))}
              />
            ))}
          </g>

          {/* Expressway labels */}
          <g className="text-[9px] fill-slate-400 font-mono">
            <text x="315" y="346">PIE</text>
            <text x="538" y="348">CTE</text>
            <text x="692" y="425">ECP</text>
          </g>

          {/* Rain Radar Cells Layer */}
          {showRainLayer &&
            weather.cells.map((cell) => {
              if (cell.rainfallMmHr < 0.5) return null;
              const { x, y } = projectSgCoords(cell.lat, cell.lng);
              const rPx = cell.radiusKm * 22;
              const gradId =
                cell.severity === 'thundery'
                  ? 'url(#rainThundery)'
                  : cell.severity === 'heavy'
                  ? 'url(#rainHeavy)'
                  : cell.severity === 'moderate'
                  ? 'url(#rainModerate)'
                  : 'url(#rainLight)';
              const colors = getRainColor(cell);

              return (
                <g
                  key={cell.id}
                  onMouseEnter={() => setHoveredCell(cell)}
                  onMouseLeave={() => setHoveredCell(null)}
                  className="cursor-pointer"
                >
                  <circle cx={x} cy={y} r={rPx * 1.3} fill={gradId} />
                  <circle
                    cx={x}
                    cy={y}
                    r={rPx * 0.68}
                    fill={colors.fill}
                    stroke={colors.stroke}
                    strokeWidth="0.9"
                    strokeDasharray="3 3"
                  />
                  {(radarFocusMode || zoom >= 1.15) && (
                    <text
                      x={x}
                      y={y + 3}
                      textAnchor="middle"
                      className="text-[9px] font-mono font-semibold fill-slate-800 pointer-events-none"
                    >
                      {cell.rainfallMmHr.toFixed(0)} mm/h
                    </text>
                  )}
                </g>
              );
            })}

          {/* Selected Bus Route Geometry */}
          {selectedRoute && (
            <g>
              {selectedRoute.legs.map((leg) => {
                if (leg.type === 'walk') {
                  const pathD = lineToPath([leg.fromCoords, leg.toCoords]);
                  const isSheltered = (leg.shelterPct ?? 0) >= 75;
                  return (
                    <g key={leg.id}>
                      <path
                        d={pathD}
                        fill="none"
                        stroke={isSheltered ? '#15803d' : '#d97706'}
                        strokeWidth={3 / Math.sqrt(zoom)}
                        strokeDasharray="5 4"
                        strokeLinecap="round"
                      />
                    </g>
                  );
                }

                const pts =
                  leg.waypoints && leg.waypoints.length >= 2
                    ? leg.waypoints
                    : [leg.fromCoords, leg.toCoords];
                const pathD = lineToPath(pts);
                const midPt = projectSgCoords(
                  pts[Math.floor(pts.length / 2)].lat,
                  pts[Math.floor(pts.length / 2)].lng
                );

                return (
                  <g key={leg.id}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#1d4ed8"
                      strokeWidth={4.5 / Math.sqrt(zoom)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#93c5fd"
                      strokeWidth={1.6 / Math.sqrt(zoom)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* Service Number Marker */}
                    <g transform={`translate(${midPt.x}, ${midPt.y}) scale(${1 / Math.sqrt(zoom)})`}>
                      <rect
                        x="-20"
                        y="-10"
                        width="40"
                        height="20"
                        rx="4"
                        fill="#0f172a"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                      <text
                        x="0"
                        y="3.5"
                        textAnchor="middle"
                        className="text-[10px] font-mono font-semibold fill-white"
                      >
                        {leg.serviceNo}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>
          )}

          {/* Bus Stops Layer */}
          {SINGAPORE_BUS_STOPS.map((stop) => {
            const isRouteStop = routeStopIds.has(stop.id);
            const isSelected = selectedStopId === stop.id;
            if (!showAllStops && !isRouteStop && !isSelected) return null;

            const { x, y } = projectSgCoords(stop.lat, stop.lng);
            const scale = 1 / Math.sqrt(zoom);

            return (
              <g
                key={stop.id}
                transform={`translate(${x}, ${y}) scale(${scale})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectStop?.(stop);
                }}
                onMouseEnter={() => setHoveredStop(stop)}
                onMouseLeave={() => setHoveredStop(null)}
                className="cursor-pointer"
              >
                {showShelterLayer && stop.hasShelter && (
                  <circle
                    r={isRouteStop || isSelected ? 10 : 7.5}
                    fill="rgba(21, 128, 61, 0.14)"
                    stroke="#15803d"
                    strokeWidth="0.9"
                  />
                )}
                <circle
                  r={isSelected ? 6 : isRouteStop ? 5.2 : 3.6}
                  fill={
                    isSelected
                      ? '#1d4ed8'
                      : isRouteStop
                      ? '#0f172a'
                      : stop.hasShelter
                      ? '#ffffff'
                      : '#fef3c7'
                  }
                  stroke={
                    isSelected || isRouteStop
                      ? '#ffffff'
                      : stop.hasShelter
                      ? '#15803d'
                      : '#d97706'
                  }
                  strokeWidth={isRouteStop || isSelected ? '1.8' : '1.4'}
                />
                {(isRouteStop || isSelected || zoom >= 1.65) && (
                  <text
                    x="8"
                    y="3"
                    className="text-[9.5px] font-medium fill-slate-800 pointer-events-none"
                    style={{ textShadow: '0 0 3px #fff, 0 0 3px #fff' }}
                  >
                    {stop.name}
                  </text>
                )}
              </g>
            );
          })}

          {/* Origin Marker (A) */}
          {origin && (() => {
            const { x, y } = projectSgCoords(origin.lat, origin.lng);
            return (
              <g transform={`translate(${x}, ${y}) scale(${1 / Math.sqrt(zoom)})`}>
                <circle r="11" fill="#2563eb" stroke="#ffffff" strokeWidth="2.5" />
                <text
                  x="0"
                  y="3.5"
                  textAnchor="middle"
                  className="text-[11px] font-mono font-bold fill-white"
                >
                  A
                </text>
              </g>
            );
          })()}

          {/* Destination Marker (B) */}
          {destination && (() => {
            const { x, y } = projectSgCoords(destination.lat, destination.lng);
            return (
              <g transform={`translate(${x}, ${y}) scale(${1 / Math.sqrt(zoom)})`}>
                <circle r="11" fill="#0f172a" stroke="#ffffff" strokeWidth="2.5" />
                <text
                  x="0"
                  y="3.5"
                  textAnchor="middle"
                  className="text-[11px] font-mono font-bold fill-white"
                >
                  B
                </text>
              </g>
            );
          })()}
        </g>
      </svg>

      {/* Hover Tooltip for Stop or Rain Cell */}
      {(hoveredStop || hoveredCell) && (
        <div className="absolute bottom-12 left-3 z-20 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-2 shadow-md max-w-xs pointer-events-none">
          {hoveredStop ? (
            <div>
              <div className="text-xs font-semibold text-slate-900">
                {hoveredStop.name} · <span className="font-mono">{hoveredStop.id}</span>
              </div>
              <div className="text-[11px] text-slate-600 mt-0.5">
                {hoveredStop.hasShelter
                  ? `Sheltered stop · ${hoveredStop.coveredLinkwayTo ?? 'Covered roof'}`
                  : 'Unsheltered roadside stop'}
              </div>
              <div className="text-[11px] font-mono text-blue-700 mt-0.5">
                Bus: {hoveredStop.services.slice(0, 6).join(', ')}
                {hoveredStop.services.length > 6 ? '…' : ''}
              </div>
            </div>
          ) : hoveredCell ? (
            <div>
              <div className="text-xs font-semibold text-slate-900">
                {hoveredCell.areaName} ({hoveredCell.region})
              </div>
              <div className="text-[11px] text-slate-600 mt-0.5 font-mono tabular-nums">
                {hoveredCell.rainfallMmHr.toFixed(1)} mm/hr · {hoveredCell.forecast2Hr}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Bottom Legend Bar */}
      <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-3 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-2 text-[11px] text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-3.5 h-0.5 bg-blue-700 inline-block rounded" />
            Bus Route
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-3.5 h-0.5 border-b-2 border-dashed border-emerald-700 inline-block" />
            Sheltered Walk
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-3.5 h-0.5 border-b-2 border-dashed border-amber-600 inline-block" />
            Uncovered Walk
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600/35 border border-blue-700 inline-block" />
            Moderate/Heavy Rain
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600/40 border border-red-700 inline-block" />
            Thundery Cell
          </span>
        </div>
        <span className="text-slate-500 font-mono tabular-nums">
          Zoom {Math.round(zoom * 100)}% · Click any stop for live bus timings
        </span>
      </div>
    </div>
  );
};
